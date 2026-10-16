import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mockPush, mockRefresh, mockGetProgress, mockRunInBrowser, mockRetryTerminal } = vi.hoisted(() => ({
  mockRetryTerminal: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockGetProgress: vi.fn(),
  mockRunInBrowser: vi.fn(),
}))

const mockSse = vi.hoisted(() => {
  const doneListeners: (() => void)[] = []
  const inst = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    onerror: null as ((e: Event) => void) | null,
    close: vi.fn(),
    addEventListener: vi.fn((event: string, handler: () => void) => {
      if (event === "done") doneListeners.push(handler)
    }),
    message(data: object) { inst.onmessage?.({ data: JSON.stringify(data) } as MessageEvent) },
    done() { doneListeners.forEach(h => h()) },
    reset() {
      inst.close.mockClear()
      inst.addEventListener.mockClear()
      inst.onmessage = null
      inst.onerror = null
      doneListeners.length = 0
    },
  }
  return inst
})

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: mockGetProgress }))
vi.mock("@/actions/preps", () => ({ getMyPrep: vi.fn(), getPrepTokens: vi.fn() }))
vi.mock("@/actions/jobs", () => ({ retryTerminalJobs: mockRetryTerminal }))
vi.mock("@/actions/questions", () => ({ listMyQuestions: vi.fn() }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/jobs/clientExecution", () => ({ runGeneration: mockRunInBrowser }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => ({ provider: "openai", model: "gpt-5-mini", tier: "flex", key: "sk-secret" }) }))

import { getMyPrep } from "@/actions/preps"
import GenerationPanel from "@/app/preps/[id]/GenerationPanel"
import type { PrepProgress } from "@/repositories/prepStateRepository"

const fetchMock = vi.fn()

const progress = (overrides: Partial<PrepProgress> = {}): PrepProgress => ({
  runState: "idle", totalPages: 1, ocrPages: 1, rejectedPages: 0, hasConcepts: false, totalQuestions: 0, completedQuestions: 0, failedQuestions: 0, terminalQuestions: 0, ...overrides,
})

function renderPanel(initialProgress: PrepProgress | null = null) {
  return render(
    <GenerationPanel
      prepId="prep-1"
      prepTitle="Prep #1"
      initialProgress={initialProgress}
      hasQuestions={false}
      onTitleReady={vi.fn()}
      onComplete={vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("EventSource", class { constructor() { return mockSse as never } })
  mockSse.reset()
  fetchMock.mockResolvedValue({ status: 202 })
  mockGetProgress.mockResolvedValue(progress())
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("GenerationPanel execution mode", () => {
  it("with no mode saved, shows mode dialog; selecting client then runs in browser", async () => {
    mockRunInBrowser.mockResolvedValue(undefined)
    renderPanel()

    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(await screen.findByRole("heading", { name: /where should your prep run/i })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /client/i })).toBeChecked()

    await userEvent.click(screen.getByRole("button", { name: "Continue" }))

    expect(mockRunInBrowser).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows an error toast when the generated title cannot be loaded", async () => {
    localStorage.setItem("prepify_execution_mode", "client")
    vi.mocked(getMyPrep).mockRejectedValue(new Error("boom"))
    mockRunInBrowser.mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: "questions" })
      await vi.waitFor(() => expect(toastError).toHaveBeenCalled())
    })
    renderPanel()

    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(toastError).toHaveBeenCalledWith("Could not load the generated title")
  })

  it("uses the saved server preference without any dialog", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(mockRunInBrowser).not.toHaveBeenCalled()
  })

  it("posts the key, prep and user settings in server mode, without running in the browser", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(fetchMock).toHaveBeenCalledOnce()
    const [ url, init ] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/preps/generate")
    expect(JSON.parse(init.body)).toMatchObject({
      apiKey: "sk-secret",
      prepId: "prep-1",
      model: "gpt-5-mini",
      tier: "flex",
      target: { questionCount: 10 },
    })
    expect(mockRunInBrowser).not.toHaveBeenCalled()
  })

  it.each([
    [ 400, /rejected/i ],
    [ 401, /signed out/i ],
    [ 403, /don't own/i ],
    [ 404, /not found/i ],
  ])("shows an error for a %i response", async (status, message) => {
    fetchMock.mockResolvedValue({ status })
    localStorage.setItem("prepify_execution_mode", "server")
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it("treats 409 as an already-running run, not an error", async () => {
    fetchMock.mockResolvedValue({ status: 409 })
    mockGetProgress.mockResolvedValue(progress({ runState: "running" }))
    localStorage.setItem("prepify_execution_mode", "server")
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(await screen.findByText(/running on the server/i)).toBeInTheDocument()
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument()
  })
})

describe("GenerationPanel progress from the DB", () => {
  it("shows OCR progress while a server run is still recognising pages", () => {
    renderPanel(progress({ runState: "running", totalPages: 3, ocrPages: 1 }))

    expect(screen.getByText("Recognise pages")).toBeInTheDocument()
    expect(screen.getByText("(1/3)")).toBeInTheDocument()
  })

  it("reports rejected pages in the OCR row", () => {
    renderPanel(progress({ runState: "running", totalPages: 4, ocrPages: 1, rejectedPages: 3 }))

    expect(screen.getByText("3 unreadable")).toBeInTheDocument()
  })

  it("opens an SSE stream while a server run is live and refreshes the page when it ends", async () => {
    renderPanel(progress({ runState: "running", totalQuestions: 4 }))
    expect(screen.getByText(/running on the server/i)).toBeInTheDocument()

    await act(async () => {
      mockSse.message(progress({ runState: "running", totalQuestions: 4, completedQuestions: 1 }))
    })
    expect(mockRefresh).not.toHaveBeenCalled()

    await act(async () => { mockSse.done() })
    expect(mockRefresh).toHaveBeenCalledOnce()
    expect(mockSse.close).toHaveBeenCalled()
  })

  it("offers a resume for interrupted jobs that re-sends the key to the same endpoint", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    renderPanel(progress({ runState: "interrupted", hasConcepts: true, totalQuestions: 4, completedQuestions: 2 }))
    expect(screen.getByText(/interrupted/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Resume" }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ apiKey: "sk-secret", prepId: "prep-1" })
  })

  it("resumes interrupted jobs in the browser in client mode, without fetch", async () => {
    localStorage.setItem("prepify_execution_mode", "client")
    mockRunInBrowser.mockResolvedValue(undefined)
    renderPanel(progress({ runState: "interrupted", hasConcepts: true, totalQuestions: 4, completedQuestions: 2 }))

    await userEvent.click(screen.getByRole("button", { name: "Resume" }))

    expect(mockRunInBrowser).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("retries terminal jobs then runs in the browser in client mode", async () => {
    localStorage.setItem("prepify_execution_mode", "client")
    mockRetryTerminal.mockResolvedValue(undefined)
    mockRunInBrowser.mockResolvedValue(undefined)
    renderPanel(progress({ hasConcepts: true, totalQuestions: 3, completedQuestions: 1, failedQuestions: 1, terminalQuestions: 1 }))

    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(mockRetryTerminal).toHaveBeenCalledWith("prep-1")
    expect(mockRunInBrowser).toHaveBeenCalled()
    expect(mockRetryTerminal.mock.invocationCallOrder[0]).toBeLessThan(mockRunInBrowser.mock.invocationCallOrder[0])
  })

  it("retries terminal jobs and refreshes progress in server mode, without running in the browser", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    mockRetryTerminal.mockResolvedValue(undefined)
    renderPanel(progress({ hasConcepts: true, totalQuestions: 3, completedQuestions: 1, failedQuestions: 1, terminalQuestions: 1 }))

    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(mockRetryTerminal).toHaveBeenCalledWith("prep-1")
    expect(mockGetProgress).toHaveBeenCalled()
    expect(mockRunInBrowser).not.toHaveBeenCalled()
  })

  it("shows terminally failed questions apart from retryable ones and retries them on click", async () => {
    renderPanel(progress({ hasConcepts: true, totalQuestions: 3, completedQuestions: 1, failedQuestions: 1, terminalQuestions: 1 }))

    expect(screen.getByText(/1 failed, 1 gave up/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(mockRetryTerminal).toHaveBeenCalledWith("prep-1")
  })
})
