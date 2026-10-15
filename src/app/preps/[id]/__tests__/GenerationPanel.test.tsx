import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mockPush, mockRefresh, mockGetProgress, mockRunInBrowser } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
  mockGetProgress: vi.fn(),
  mockRunInBrowser: vi.fn(),
}))

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: mockRefresh }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: mockGetProgress }))
vi.mock("@/actions/preps", () => ({ getMyPrep: vi.fn(), getPrepTokens: vi.fn() }))
vi.mock("@/actions/questions", () => ({ listMyQuestions: vi.fn() }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/jobs/clientExecution", () => ({ runGeneration: mockRunInBrowser }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => ({ provider: "openai", model: "gpt-5-mini", tier: "flex", key: "sk-secret" }) }))

import { getMyPrep } from "@/actions/preps"
import GenerationPanel from "@/app/preps/[id]/GenerationPanel"
import { POLL_INTERVAL_MS } from "@/app/preps/[id]/useRunProgress"
import type { PrepProgress } from "@/repositories/prepStateRepository"

const fetchMock = vi.fn()

const progress = (overrides: Partial<PrepProgress> = {}): PrepProgress => ({
  runState: "idle", totalPages: 1, ocrPages: 1, hasConcepts: false, totalQuestions: 0, completedQuestions: 0, failedQuestions: 0, ...overrides,
})

async function overrideToServer() {
  await userEvent.click(screen.getByRole("button", { name: /additional settings/i }))
  await userEvent.click(screen.getByRole("radio", { name: /server-assisted/i }))
}

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
  fetchMock.mockResolvedValue({ status: 202 })
  mockGetProgress.mockResolvedValue(progress())
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("GenerationPanel execution mode", () => {
  it("defaults to client-only and never calls the server endpoint", async () => {
    mockRunInBrowser.mockResolvedValue(undefined)
    renderPanel()

    expect(screen.queryByRole("radio")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /additional settings/i }))
    expect(screen.getByRole("radio", { name: /client/i })).toBeChecked()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(mockRunInBrowser).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows an error toast when the generated title cannot be loaded", async () => {
    vi.mocked(getMyPrep).mockRejectedValue(new Error("boom"))
    mockRunInBrowser.mockImplementation(async ({ onProgress }) => {
      onProgress({ stage: "questions" })
      await vi.waitFor(() => expect(toastError).toHaveBeenCalled())
    })
    renderPanel()

    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(toastError).toHaveBeenCalledWith("Could not load the generated title")
  })

  it("uses the saved server preference without any override", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(mockRunInBrowser).not.toHaveBeenCalled()
  })

  it("lets a run override the saved preference", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    mockRunInBrowser.mockResolvedValue(undefined)
    renderPanel()
    await userEvent.click(screen.getByRole("button", { name: /additional settings/i }))
    await userEvent.click(screen.getByRole("radio", { name: /client/i }))
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(mockRunInBrowser).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("posts the key, prep and user settings in server mode, without running in the browser", async () => {
    renderPanel()
    await overrideToServer()
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
    renderPanel()
    await overrideToServer()
    await userEvent.click(screen.getByRole("button", { name: "Generate questions" }))

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it("treats 409 as an already-running run, not an error", async () => {
    fetchMock.mockResolvedValue({ status: 409 })
    mockGetProgress.mockResolvedValue(progress({ runState: "running" }))
    renderPanel()
    await overrideToServer()
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

  it("polls while a server run is live and refreshes the page when it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockGetProgress.mockResolvedValueOnce(progress({ runState: "running", totalQuestions: 4, completedQuestions: 1 }))
    mockGetProgress.mockResolvedValueOnce(progress({ totalQuestions: 4, completedQuestions: 4 }))
    renderPanel(progress({ runState: "running", totalQuestions: 4 }))
    expect(screen.getByText(/running on the server/i)).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS))
    expect(mockGetProgress).toHaveBeenCalledTimes(1)
    expect(mockRefresh).not.toHaveBeenCalled()

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS))
    expect(mockGetProgress).toHaveBeenCalledTimes(2)
    expect(mockRefresh).toHaveBeenCalledOnce()

    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2))
    expect(mockGetProgress).toHaveBeenCalledTimes(2)
  })

  it("offers a resume for interrupted jobs that re-sends the key to the same endpoint", async () => {
    renderPanel(progress({ runState: "interrupted", hasConcepts: true, totalQuestions: 4, completedQuestions: 2 }))
    expect(screen.getByText(/interrupted/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Resume on server" }))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ apiKey: "sk-secret", prepId: "prep-1" })
  })
})
