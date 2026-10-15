import type { Prep } from "@prisma/client"
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
import type { StatedConcept } from "@/repositories/prepStateRepository"

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

function renderPage(concepts: StatedConcept[]) {
  return render(
    <PrepPage prep={prep} questions={[]} attempts={[]} assets={[]} progress={null} tokensUsed={0} costUsd={0} concepts={concepts} images={[]} />,
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

  it("lists each job's cost once, with wasted calls apart", () => {
    const secondJob = { jobId: "j2", model: "gpt-5-nano", tier: "flex", calls: [ { promptTokens: 10, cachedTokens: 0, completionTokens: 5, costUsd: 0.5, executionMs: 2000, wasted: false } ] }
    renderPage([ concept(), concept({ id: "c2", name: "Osmosis" }), concept({ id: "c3", name: "Meiosis", generation: secondJob }) ])
    const jobs = within(screen.getByRole("list", { name: "Concept jobs" })).getAllByRole("listitem")
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toHaveTextContent("Job 1 · gpt-5-nano · flex: 1,000 prompt / 200 cached / 300 completion tokens · $0.0020 · 1.5s")
    expect(jobs[0]).toHaveTextContent("wasted: 400 prompt / 0 cached / 100 completion tokens · < $0.001 · 0.5s")
    expect(jobs[1]).toHaveTextContent("Job 2 · gpt-5-nano · flex: 10 prompt / 0 cached / 5 completion tokens · $0.500 · 2.0s")
    expect(jobs[1]).not.toHaveTextContent("wasted")
  })

  it("renders no concepts section when the prep has none", () => {
    renderPage([])
    expect(screen.queryByRole("list", { name: "Concepts" })).not.toBeInTheDocument()
  })
})
