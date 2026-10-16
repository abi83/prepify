import type { Prep, PrepImage, Question } from "@prisma/client"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

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

const question = (id: string, producedByJobId: string): Question =>
  ({ id, prepId: "p1", type: "flashcard", difficulty: null, language: "en", content: { front: "f", back: "b", back_explanation: "", asset_hint: { needed: false, type: null, description: null } }, producedByJobId, createdAt: CREATED_AT })

interface RenderOverrides { images?: PrepImage[]; questions?: Question[]; generations?: Record<string, JobGeneration> }

function renderPage(concepts: StatedConcept[], { images = [], questions = [], generations = {} }: RenderOverrides = {}) {
  return render(
    <PrepPage prep={prep} questions={questions} attempts={[]} assets={[]} progress={null} tokensUsed={0} costUsd={0} concepts={concepts} images={images} generations={generations} />,
  )
}

describe("PrepPage concepts", () => {
  it("renders each concept as a card with its fields", () => {
    renderPage([ concept(), concept({ id: "c2", name: "Osmosis", importance: 0.5, misconceptions: [], language: "de" }) ])
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

  it("summarises concept generation over unique jobs, wasted calls included, with a per-job detail", () => {
    const secondJob = { jobId: "j2", model: "gpt-5-nano", tier: "flex", calls: [ call(10, 5, 0.5) ] }
    renderPage([ concept(), concept({ id: "c2", name: "Osmosis" }), concept({ id: "c3", name: "Meiosis", generation: secondJob }) ])
    const section = screen.getByRole("heading", { name: "Concept generation" }).closest("section")!
    expect(section).toHaveTextContent("1,815 tokens · $0.502")
    expect(section).toHaveTextContent("gpt-5-nano · flex · 1,400 in / 400 out · $0.0025")
    expect(section).toHaveTextContent("gpt-5-nano · flex · 10 in / 5 out · $0.500")
    expect(section).not.toHaveTextContent("cached")
  })

  it("shows each page's OCR title, language and cost", () => {
    const image: PrepImage = {
      id: "i1", prepId: "p1", gcsKey: "k", status: "done", error: null, language: "de", producedByJobId: "ocr1",
      ocrResult: { title: "Zellteilung", text: "t", visual_elements: [] }, createdAt: CREATED_AT, updatedAt: CREATED_AT,
    }
    renderPage([], { images: [ image ], generations: { ocr1: { jobId: "ocr1", model: "gpt-5-nano", tier: "flex", calls: [ call(100, 20, 0.01) ] } } })
    expect(screen.getByText("Zellteilung")).toBeInTheDocument()
    expect(screen.getByText("de")).toBeInTheDocument()
    expect(screen.queryByText(/^Page 1$/)).not.toBeInTheDocument()
    expect(screen.getByText("120 tokens · $0.010")).toBeInTheDocument()
  })

  it("accumulates question cost as the per-question costs, wasted calls included", () => {
    const generations = {
      q1: { jobId: "q1", model: "gpt-5-nano", tier: "flex", calls: [ call(100, 10, 0.01), { ...call(50, 5, 0.005), wasted: true } ] },
      q2: { jobId: "q2", model: "gpt-5-nano", tier: "flex", calls: [ call(200, 20, 0.02) ] },
    }
    const questions = [ question("a", "q1"), question("b", "q2") ]
    renderPage([], { questions, generations })
    const items = [ ...screen.getByRole("list", { name: "Questions" }).querySelectorAll(":scope > li") ]
    expect(items[0]).toHaveTextContent("165 tokens · $0.015")
    expect(items[1]).toHaveTextContent("220 tokens · $0.020")
    expect(screen.getByRole("group", { name: "Questions total" })).toHaveTextContent("385 tokens · $0.035")
  })

  it("renders no concepts section when the prep has none", () => {
    renderPage([])
    expect(screen.queryByRole("list", { name: "Concepts" })).not.toBeInTheDocument()
  })
})
