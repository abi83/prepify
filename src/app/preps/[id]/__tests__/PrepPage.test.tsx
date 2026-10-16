import type { Attempt, Prep, PrepImage, Question } from "@prisma/client"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/actions/modelCatalog", async () => ({ getModelCatalog: async () => (await import("@/test/modelCatalog")).testCatalog }))
vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return createNavigationMock()
})
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: vi.fn() }))
vi.mock("@/actions/preps", () => ({ getMyPrep: vi.fn(), getPrepTokens: vi.fn(), deletePrep: vi.fn() }))
vi.mock("@/actions/jobs", () => ({ retryTerminalJobs: vi.fn() }))
vi.mock("@/actions/questions", () => ({ listMyQuestions: vi.fn() }))
vi.mock("@/actions/uploads", () => ({ getReadSignedUrl: vi.fn() }))
vi.mock("@/actions/attempts", () => ({ insertAttempt: vi.fn() }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/jobs/clientExecution", () => ({ runGeneration: vi.fn() }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => null }))

import PrepPage from "@/app/preps/[id]/PrepPage"
import { formatDate } from "@/lib/format"
import type { JobGeneration, StatedConcept } from "@/repositories/prepStateRepository"

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

interface RenderOverrides { images?: PrepImage[]; questions?: Question[]; attempts?: Attempt[]; generations?: Record<string, JobGeneration>; tokensUsed?: number; costUsd?: number }

function renderPage(concepts: StatedConcept[], { images = [], questions = [], attempts = [], generations = {}, tokensUsed = 0, costUsd = 0 }: RenderOverrides = {}) {
  return render(
    <PrepPage prep={prep} questions={questions} attempts={attempts} assets={[]} progress={null} tokensUsed={tokensUsed} costUsd={costUsd} concepts={concepts} images={images} generations={generations} />,
  )
}

// The navigation mock keeps the URL across tests.
beforeEach(() => useRouter().replace("?"))

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

  it("Main previews questions and lists the attempt history", () => {
    const attempt: Attempt = { id: "at1", prepId: "p1", userId: "u1", score: 3, total: 4, createdAt: CREATED_AT }
    renderPage([], { questions: [ flashcard("f1"), question("a", "q1") ], attempts: [ attempt ] })
    const main = screen.getByRole("tabpanel")
    expect(within(main).getByText("Question a?")).toBeInTheDocument()
    expect(within(main).getByRole("button", { name: "Start attempt" })).toBeEnabled()
    expect(within(main).getByRole("list", { name: "Attempt history" })).toHaveTextContent("3/4 (75%)")
  })

  it("with no questions, Main points to the Generation tab", async () => {
    renderPage([])
    await userEvent.click(screen.getByRole("button", { name: "Go to Generation" }))
    expect(screen.getByRole("tab", { name: "Generation" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("button", { name: "Generate questions" })).toBeVisible()
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
