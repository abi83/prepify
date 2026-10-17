import type { Attempt, Prep, PrepImage, Question } from "@prisma/client"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  runOcr: vi.fn(),
  requestServerRun: vi.fn(),
  awaitRunStart: vi.fn(),
  updatePrep: vi.fn(),
  listMyPrepImages: vi.fn(),
  deleteMyPrepImage: vi.fn(),
  uploadPrepImage: vi.fn(),
  getApiKey: vi.fn(),
}))

vi.mock("@/actions/modelCatalog", async () => ({ getModelCatalog: async () => (await import("@/test/modelCatalog")).testCatalog }))
vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return createNavigationMock()
})
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: vi.fn() }))
vi.mock("@/actions/preps", () => ({ getMyPrep: vi.fn(), getPrepTokens: vi.fn(), deletePrep: vi.fn(), updatePrep: h.updatePrep }))
vi.mock("@/actions/prepImages", () => ({ listMyPrepImages: h.listMyPrepImages, deleteMyPrepImage: h.deleteMyPrepImage, createPrepImage: vi.fn() }))
vi.mock("@/actions/jobs", () => ({ retryTerminalJobs: vi.fn() }))
vi.mock("@/actions/questions", () => ({ listMyQuestions: vi.fn() }))
vi.mock("@/actions/uploads", () => ({ getReadSignedUrl: vi.fn().mockResolvedValue("https://gcs/signed"), getUploadSignedUrl: vi.fn() }))
vi.mock("@/actions/attempts", () => ({ insertAttempt: vi.fn() }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/jobs/clientExecution", () => ({ runGeneration: vi.fn(), runOcr: h.runOcr }))
vi.mock("@/lib/jobs/serverRunClient", () => ({ requestServerRun: h.requestServerRun, awaitRunStart: h.awaitRunStart }))
vi.mock("@/lib/prepImageUpload", async importActual => ({ ...await importActual<typeof import("@/lib/prepImageUpload")>(), uploadPrepImage: h.uploadPrepImage }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: h.getApiKey }))

import PrepPage from "@/app/preps/[id]/PrepPage"
import { BYOK_TEXT_HARD_LIMIT } from "@/core/lib/config"
import { formatDate } from "@/lib/format"
import { clearUploads } from "@/lib/uploadQueue"
import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"

const prep: Prep = {
  id: "p1", userId: "u1", title: "Biology", createdAt: new Date(0), visibility: "private",
  grade: 10, discipline: null, language: null, description: "", isActive: true,
}

const CREATED_AT = new Date("2026-03-04T12:00:00Z")

function concept(overrides: Partial<StatedConcept> = {}): StatedConcept {
  return {
    id: "c1", name: "Mitosis", description: "Cell division producing two identical daughter cells.", importance: 0.9,
    misconceptions: [ "Mitosis makes gametes" ], language: "en", createdAt: CREATED_AT,
    generation: {
      jobId: "j1", model: "gpt-5-nano", tier: "flex",
      calls: [
        { promptTokens: 1000, cachedTokens: 200, completionTokens: 300, costUsd: 0.002, executionMs: 1500, wasted: false },
        { promptTokens: 400, cachedTokens: 0, completionTokens: 100, costUsd: 0.0005, executionMs: 500, wasted: true },
      ],
    },
    ...overrides,
  }
}

const call = (promptTokens: number, completionTokens: number, costUsd: number) =>
  ({ promptTokens, cachedTokens: 0, completionTokens, costUsd, executionMs: 1, wasted: false })

const flashcard = (id: string): Question =>
  ({ id, prepId: "p1", type: "flashcard", difficulty: null, language: "en", content: { front: "f", back: "b", back_explanation: "", asset_hint: { needed: false, type: null, description: null } }, producedByJobId: null, createdAt: CREATED_AT })

const question = (id: string, producedByJobId: string): Question =>
  ({
    id, prepId: "p1", type: "single_choice", difficulty: null, language: "en", producedByJobId, createdAt: CREATED_AT,
    content: {
      question: `Question ${id}?`, rationale: "", asset_hint: { needed: false, type: null, description: null },
      answers: [ { id: "a", text: "right", is_correct: true, explanation: "" }, { id: "b", text: "wrong", is_correct: false, explanation: "" } ],
    },
  })

interface RenderOverrides { images?: PrepImage[]; questions?: Question[]; attempts?: Attempt[]; progress?: PrepProgress | null; generations?: Record<string, JobGeneration>; rejectedGenerations?: Record<string, JobGeneration>; tokensUsed?: number; costUsd?: number }

function renderPage(concepts: StatedConcept[], { images = [], questions = [], attempts = [], progress = null, generations = {}, rejectedGenerations = {}, tokensUsed = 0, costUsd = 0 }: RenderOverrides = {}) {
  return render(
    <PrepPage prep={prep} questions={questions} attempts={attempts} assets={[]} progress={progress} tokensUsed={tokensUsed} costUsd={costUsd} concepts={concepts} images={images} generations={generations} rejectedGenerations={rejectedGenerations} />,
  )
}

// The navigation mock keeps the URL across tests.
beforeEach(() => {
  vi.clearAllMocks()
  useRouter().replace("?")
  h.getApiKey.mockReturnValue(null)
})

const openTab = (name: RegExp) => userEvent.click(screen.getByRole("tab", { name }))

describe("PrepPage concepts", () => {
  it("renders each concept as a card with its fields", async () => {
    renderPage([ concept(), concept({ id: "c2", name: "Osmosis", importance: 0.5, misconceptions: [], language: "de" }) ])
    await openTab(/^Concepts/)
    const headings = within(screen.getByRole("list", { name: "Concepts" })).getAllByRole("heading", { level: 3 })
    const cards = headings.map(heading => heading.closest("li")!)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent("Mitosis")
    expect(cards[0]).toHaveTextContent("Cell division producing two identical daughter cells.")
    expect(within(cards[0]).getByRole("meter", { name: "Importance" })).toHaveAttribute("aria-valuenow", "0.9")
    expect(cards[0]).toHaveTextContent("Mitosis makes gametes")
    expect(cards[0]).toHaveTextContent("en")
    expect(cards[0]).toHaveTextContent(formatDate(CREATED_AT))
    expect(cards[1]).not.toHaveTextContent("Misconceptions")
  })

  it("summarises concept generation over unique jobs, wasted calls included, with a per-job detail", async () => {
    const secondJob = { jobId: "j2", model: "gpt-5-nano", tier: "flex", calls: [ call(10, 5, 0.5) ] }
    renderPage([ concept(), concept({ id: "c2", name: "Osmosis" }), concept({ id: "c3", name: "Meiosis", generation: secondJob }) ])
    await openTab(/^Concepts/)
    const section = screen.getByRole("heading", { name: "Concept generation" }).closest("section")!
    expect(section).toHaveTextContent("1,815 tokens · $0.502")
    expect(section).toHaveTextContent("gpt-5-nano · flex · 1,400 in / 400 out · $0.0025")
    expect(section).toHaveTextContent("gpt-5-nano · flex · 10 in / 5 out · $0.500")
    expect(section).not.toHaveTextContent("cached")
  })

  it("shows each page's OCR title, language and cost", async () => {
    const image: PrepImage = {
      id: "i1", prepId: "p1", gcsKey: "k", status: "done", error: null, language: "de", producedByJobId: "ocr1",
      ocrResult: { title: "Zellteilung", text: "t", visual_elements: [] }, createdAt: CREATED_AT, updatedAt: CREATED_AT,
    }
    renderPage([], { images: [ image ], generations: { ocr1: { jobId: "ocr1", model: "gpt-5-nano", tier: "flex", calls: [ call(100, 20, 0.01) ] } } })
    await openTab(/^Pages/)
    expect(screen.getByText("Zellteilung")).toBeInTheDocument()
    expect(screen.getByText("de")).toBeInTheDocument()
    expect(screen.queryByText(/^Page 1$/)).not.toBeInTheDocument()
    expect(within(screen.getByRole("tabpanel")).getByText("120 tokens · $0.010")).toBeInTheDocument()
  })

  it("shows a question's generation cost on the question itself, wasted calls included", async () => {
    const generations = {
      q1: { jobId: "q1", model: "gpt-5-nano", tier: "flex", calls: [ call(100, 10, 0.01), { ...call(50, 5, 0.005), wasted: true } ] },
    }
    renderPage([], { questions: [ question("a", "q1") ], generations })
    await openTab(/^Questions/)
    expect(within(screen.getByRole("tabpanel")).getByText("165 tokens · $0.015")).toBeInTheDocument()
  })

  it("shows an empty state when the prep has no concepts", async () => {
    renderPage([])
    await openTab(/^Concepts/)
    expect(screen.getByText("No concepts extracted yet.")).toBeInTheDocument()
  })
})

describe("PrepPage shell", () => {
  it("lists the tabs in order with Main selected by default", () => {
    renderPage([], { questions: [ flashcard("f1"), question("a", "q1") ] })
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map(t => t.textContent?.replace(/\d+$/, ""))).toEqual([ "Main", "Flashcards", "Questions", "Concepts", "Pages", "Audio", "Video", "Generation" ])
    expect(screen.getByRole("tab", { name: "Main" })).toHaveAttribute("aria-selected", "true")
  })

  it("shows the prep total in the header", () => {
    renderPage([], { tokensUsed: 1300, costUsd: 0.002 })
    expect(screen.getByRole("banner")).toHaveTextContent("1,300 tokens · $0.002")
  })

  it("Main summarizes progress: stats, history and tile links", async () => {
    const attempts: Attempt[] = [
      { id: "at2", prepId: "p1", userId: "u1", score: 3, total: 4, createdAt: CREATED_AT },
      { id: "at1", prepId: "p1", userId: "u1", score: 2, total: 4, createdAt: CREATED_AT },
    ]
    renderPage([ concept() ], { questions: [ flashcard("f1"), question("a", "q1") ], attempts })
    const main = screen.getByRole("tabpanel")
    expect(within(main).queryByText("Question a?")).not.toBeInTheDocument()
    expect(within(main).getByRole("button", { name: "Start attempt" })).toBeEnabled()
    expect(within(main).getByRole("list", { name: "Attempt history" })).toHaveTextContent("3/4 (75%)")
    expect(within(main).getByText("75% (+25 pts)")).toBeInTheDocument()
    expect(within(main).getByRole("img", { name: "Scores: 50%, 75%" })).toBeInTheDocument()
    expect(within(main).getByRole("list", { name: "Concept names" })).toHaveTextContent("Mitosis")
    await userEvent.click(within(main).getByRole("button", { name: /^Flashcards/ }))
    expect(screen.getByRole("tab", { name: /^Flashcards/ })).toHaveAttribute("aria-selected", "true")
  })

  it("with no questions, Main disables Start attempt and shows generation status", () => {
    const progress: PrepProgress = {
      runState: "idle", totalPages: 3, ocrPages: 3, rejectedPages: 0, hasConcepts: false,
      totalQuestions: 10, completedQuestions: 0, failedQuestions: 1, terminalQuestions: 0,
    }
    renderPage([], { progress })
    const main = screen.getByRole("tabpanel")
    expect(within(main).getByRole("button", { name: "Start attempt" })).toBeDisabled()
    expect(within(main).getByRole("button", { name: /^Questions/ })).toHaveTextContent("0/10 generated · 1 failed")
    expect(within(main).getByRole("button", { name: /^Concepts/ })).toHaveTextContent("pending")
    expect(within(main).getByText("No attempts yet.")).toBeInTheDocument()
  })

  it.each([ "Audio", "Video" ])("%s is a placeholder tab", async name => {
    renderPage([])
    await openTab(new RegExp(`^${name}`))
    expect(screen.getByText(`${name} is coming soon`)).toBeInTheDocument()
  })

  it("collapses Share and Delete into the actions menu for the owner", async () => {
    renderPage([], { questions: [ question("a", "q1") ] })
    await userEvent.click(screen.getByRole("button", { name: "Prep actions" }))
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }))
    expect(screen.getByRole("dialog", { name: "Delete prep?" })).toBeInTheDocument()
  })
})

describe("PrepPage generation log", () => {
  it("lists every generation job on the Generation tab", async () => {
    const generations = {
      j1: { jobId: "j1", model: "gpt-5-nano", tier: "flex", calls: [ call(10, 5, 0.5) ] },
      j2: { jobId: "j2", model: "gpt-5-mini", tier: "flex", calls: [ call(20, 5, 0.1) ] },
    }
    renderPage([], { generations })
    await openTab(/^Generation/)
    const log = screen.getByRole("heading", { name: "Generation log" }).closest("section")!
    expect(log).toHaveTextContent("gpt-5-nano · flex · 10 in / 5 out · $0.500")
    expect(log).toHaveTextContent("gpt-5-mini · flex · 20 in / 5 out · $0.100")
  })
})

describe("PrepPage OCR verdicts", () => {
  const accepted: PrepImage = {
    id: "i1", prepId: "p1", gcsKey: "k1", status: "done", error: null, language: "de", producedByJobId: null,
    ocrResult: { title: "Zellteilung", text: "t", visual_elements: [] }, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  }
  const rejected = (id: string, error: string): PrepImage =>
    ({ ...accepted, id, gcsKey: `k-${id}`, status: "failed", error, language: null, ocrResult: null })

  const REASONS = [
    [ "ocr_text_too_short:5", /too little text/i ],
    [ "ocr_text_not_letters:0.69", /isn't readable/i ],
    [ "low_confidence:0.3", /too blurry or dark/i ],
    [ "unsupported_language:ja. Supported languages: English", /language Prepify doesn't support/i ],
  ] as const

  it("shows an accepted and a rejected page together", async () => {
    renderPage([], { images: [ accepted, rejected("i2", REASONS[0][0]) ] })
    await openTab(/^Pages/)
    expect(screen.getByText("Zellteilung")).toBeInTheDocument()
    expect(screen.getByText("Page 2")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("expands a rejected page to its photo and reason", async () => {
    renderPage([], { images: [ accepted, rejected("i2", REASONS[2][0]) ] })
    await openTab(/^Pages/)
    await userEvent.click(screen.getAllByRole("button", { name: "Expand" })[1])
    expect(await screen.findByAltText("Page 2 original")).toHaveAttribute("src", "https://gcs/signed")
    expect(screen.getByRole("alert")).toHaveTextContent(REASONS[2][1])
  })

  it("labels a rejected page's cost wasted, and shows none without wasted calls", async () => {
    const wasted = { jobId: "o2", model: "gpt-5-nano", tier: "flex", calls: [ { ...call(100, 20, 0.01), wasted: true } ] }
    renderPage([], { images: [ rejected("i2", REASONS[0][0]), rejected("i3", REASONS[0][0]) ], rejectedGenerations: { i2: wasted } })
    await openTab(/^Pages/)
    expect(screen.getAllByText(/tokens ·/)).toHaveLength(1)
    expect(screen.getByText("Wasted: 120 tokens · $0.010")).toBeInTheDocument()
  })

  it.each(REASONS)("explains %s in plain words", async (error, message) => {
    renderPage([], { images: [ accepted, rejected("i2", error) ] })
    await openTab(/^Pages/)
    await userEvent.click(screen.getAllByRole("button", { name: "Expand" })[1])
    expect(screen.getByRole("alert")).toHaveTextContent(message)
    expect(screen.getByRole("alert")).not.toHaveTextContent(error.split(":")[0])
  })

  it("falls back to a generic message with the raw code for an unknown error", async () => {
    renderPage([], { images: [ accepted, rejected("i2", "weird_code:1") ] })
    await openTab(/^Pages/)
    await userEvent.click(screen.getAllByRole("button", { name: "Expand" })[1])
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't be read (weird_code).")
  })

  it("shows the reason on the rejected thumbnail in the draft", async () => {
    const draft: Prep = { ...prep, isActive: false }
    render(<PrepPage prep={draft} questions={[]} attempts={[]} assets={[]} progress={null} tokensUsed={0} costUsd={0} concepts={[]} images={[ accepted, rejected("i2", REASONS[2][0]) ]} generations={{}} rejectedGenerations={{}} />)
    expect(await screen.findByRole("alert")).toHaveTextContent(REASONS[2][1])
  })
})

describe("PrepPage draft", () => {
  const draft: Prep = { ...prep, isActive: false }
  const KEY = { provider: "openai", model: "gpt-5-mini", tier: "flex", key: "sk-secret" }
  const imageRow = (id: string, ocrText: string | null = null): PrepImage => ({
    id, prepId: "p1", gcsKey: `prep-pages/p1/page-${id}.png`, status: "pending", error: null, language: null, producedByJobId: null,
    ocrResult: ocrText === null ? null : { title: "t", text: ocrText, visual_elements: [] }, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  })

  function renderDraft(images: PrepImage[] = []) {
    return render(
      <PrepPage prep={draft} questions={[]} attempts={[]} assets={[]} progress={null} tokensUsed={0} costUsd={0} concepts={[]} images={images} generations={{}} rejectedGenerations={{}} />,
    )
  }

  const prepMe = () => screen.getByRole("button", { name: "Prep me" })

  beforeEach(() => {
    clearUploads("p1")
    localStorage.clear()
    h.runOcr.mockResolvedValue(undefined)
    h.requestServerRun.mockResolvedValue("triggered")
    h.awaitRunStart.mockResolvedValue(undefined)
    h.updatePrep.mockResolvedValue(undefined)
    h.deleteMyPrepImage.mockResolvedValue(undefined)
    h.listMyPrepImages.mockResolvedValue([ imageRow("0", "some text") ])
  })

  it("renders the draft view instead of the tabs, with the persisted images", async () => {
    renderDraft([ imageRow("0"), imageRow("1") ])
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(await screen.findByAltText("Page 2")).toHaveAttribute("src", "https://gcs/signed")
    expect(screen.getByText("2 / 10 pages")).toBeInTheDocument()
  })

  it("keeps rendering a prep with jobs as before", () => {
    const withProgress = { runState: "idle" as const, totalPages: 1, ocrPages: 1, rejectedPages: 0, hasConcepts: false, totalQuestions: 0, completedQuestions: 0, failedQuestions: 0, terminalQuestions: 0 }
    render(<PrepPage prep={draft} questions={[]} attempts={[]} assets={[]} progress={withProgress} tokensUsed={0} costUsd={0} concepts={[]} images={[]} generations={{}} rejectedGenerations={{}} />)
    expect(screen.getAllByRole("tab")).not.toHaveLength(0)
  })

  it("disables Prep me with no images, enables it with one", () => {
    const { unmount } = renderDraft([])
    expect(prepMe()).toBeDisabled()
    unmount()
    renderDraft([ imageRow("0") ])
    expect(prepMe()).toBeEnabled()
  })

  it("disables Prep me while an added image uploads, and enables it once persisted", async () => {
    let finish: (image: { id: string }) => void = () => {}
    h.uploadPrepImage.mockReturnValue(new Promise(resolve => { finish = resolve }))
    renderDraft([ imageRow("0") ])

    await userEvent.upload(document.querySelector("input[type=file]:not([capture])")!, new File([ "x" ], "new.png", { type: "image/png" }))
    expect(await screen.findByRole("status", { name: "Uploading page 2" })).toBeInTheDocument()
    expect(h.uploadPrepImage).toHaveBeenCalledWith("p1", 1, expect.any(File))
    expect(prepMe()).toBeDisabled()

    act(() => finish({ id: "new" }))
    await waitFor(() => expect(prepMe()).toBeEnabled())
  })

  it("disables Prep me after a failed upload until the image is removed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    h.uploadPrepImage.mockRejectedValue(new Error("boom"))
    renderDraft([ imageRow("0") ])

    await userEvent.upload(document.querySelector("input[type=file]:not([capture])")!, new File([ "x" ], "bad.png", { type: "image/png" }))
    expect(await screen.findByRole("img", { name: "Page 2 failed to upload" })).toBeInTheDocument()
    expect(prepMe()).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "Remove page 2" }))
    expect(h.deleteMyPrepImage).not.toHaveBeenCalled()
    expect(prepMe()).toBeEnabled()
  })

  it("removes a persisted image on the server", async () => {
    renderDraft([ imageRow("0"), imageRow("1") ])
    await userEvent.click(screen.getByRole("button", { name: "Remove page 2" }))
    expect(h.deleteMyPrepImage).toHaveBeenCalledWith("1")
  })

  it("asks for the execution mode first, then runs OCR in the browser and activates the prep", async () => {
    h.getApiKey.mockReturnValue(KEY)
    renderDraft([ imageRow("0") ])
    await userEvent.click(prepMe())

    expect(await screen.findByRole("heading", { name: /where should your prep run/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Continue" }))

    await waitFor(() => expect(h.updatePrep).toHaveBeenCalledWith("p1", { isActive: true }))
    expect(h.runOcr).toHaveBeenCalledOnce()
    expect(h.requestServerRun).not.toHaveBeenCalled()
    expect(useRouter().refresh).toHaveBeenCalled()
  })

  it("runs on the server with the saved preference", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    h.getApiKey.mockReturnValue(KEY)
    renderDraft([ imageRow("0") ])
    await userEvent.click(prepMe())

    await waitFor(() => expect(h.awaitRunStart).toHaveBeenCalledWith("p1"))
    expect(h.updatePrep).toHaveBeenCalledWith("p1", { isActive: true })
    expect(h.requestServerRun).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-secret", prepId: "p1", model: "gpt-5-mini", tier: "flex" }))
    expect(h.runOcr).not.toHaveBeenCalled()
    expect(useRouter().refresh).toHaveBeenCalled()
  })

  it("shows the error when the server rejects the run", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    h.getApiKey.mockReturnValue(KEY)
    h.requestServerRun.mockRejectedValue(new Error("You are signed out. Sign in again."))
    renderDraft([ imageRow("0") ])
    await userEvent.click(prepMe())

    expect(await screen.findByText(/signed out/i)).toBeInTheDocument()
    expect(useRouter().refresh).not.toHaveBeenCalled()
  })

  it("shows an error when no API key is configured", async () => {
    localStorage.setItem("prepify_execution_mode", "client")
    renderDraft([ imageRow("0") ])
    await userEvent.click(prepMe())

    expect(await screen.findByText(/No API key configured/)).toBeInTheDocument()
    expect(h.runOcr).not.toHaveBeenCalled()
  })

  it("shows an error when OCR finds no text", async () => {
    localStorage.setItem("prepify_execution_mode", "client")
    h.getApiKey.mockReturnValue(KEY)
    h.listMyPrepImages.mockResolvedValue([ imageRow("0", "  ") ])
    renderDraft([ imageRow("0") ])
    await userEvent.click(prepMe())

    expect(await screen.findByText(/No text detected/)).toBeInTheDocument()
    expect(h.updatePrep).not.toHaveBeenCalled()
  })

  it("shows an error when the extracted text is over the limit", async () => {
    localStorage.setItem("prepify_execution_mode", "client")
    h.getApiKey.mockReturnValue(KEY)
    h.listMyPrepImages.mockResolvedValue([ imageRow("0", "x".repeat(BYOK_TEXT_HARD_LIMIT + 1)) ])
    renderDraft([ imageRow("0") ])
    await userEvent.click(prepMe())

    expect(await screen.findByText(/character limit/)).toBeInTheDocument()
    expect(h.updatePrep).not.toHaveBeenCalled()
  })
})
