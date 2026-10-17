import type { Prep, Question } from "@prisma/client"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return { ...createNavigationMock(), useParams: () => ({ id: "test-prep-id" }) }
})

vi.mock("@/actions/attempts", () => ({
  insertAttempt: vi.fn().mockResolvedValue({}),
}))

import StudyPage from "@/app/study/[id]/StudyPage"
import type { StatedConcept } from "@/repositories/prepStateRepository"

function prep(overrides: Partial<Prep> = {}): Prep {
  return {
    id: "test-prep-id",
    userId: "owner-id",
    title: "Biology Basics",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    visibility: "link",
    grade: 10,
    discipline: null,
    language: null,
    description: "",
    isActive: true,
    runHeartbeatAt: null,
    status: "ready",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

const call = { promptTokens: 100, cachedTokens: 0, completionTokens: 20, costUsd: 0.01, executionMs: 1, wasted: false, generatedAt: new Date(0) }
const concept: StatedConcept = {
  id: "c1", name: "Mitosis", description: "Cell division.", importance: 0.9, misconceptions: [], language: "en", createdAt: new Date(0),
  generation: { jobId: "j1", type: "concepts", status: "executed", failureReason: null, updatedAt: new Date(0), subject: "Mitosis", model: "gpt-5-nano", tier: "flex", calls: [ call ] },
}

function renderStudy(questions: Question[], overrides: Partial<ComponentProps<typeof StudyPage>> = {}) {
  return render(
    <StudyPage userId={null} prep={prep()} questions={questions} assets={[]} concepts={[ concept ]} generations={{ j1: concept.generation }} tokensUsed={120} costUsd={0.01} {...overrides} />,
  )
}

describe("StudyPage — loaded with questions", () => {
  const questions: Question[] = [
    {
      id: "q1", prepId: "test-prep-id", createdAt: new Date(0), language: "en", difficulty: null, producedByJobId: null, type: "single_choice",
      content: {
        question: "What is a cell?", rationale: "",
        answers: [
          { id: "a", text: "Basic unit", is_correct: true, explanation: "" },
          { id: "b", text: "Molecule", is_correct: false, explanation: "" },
        ],
      },
    },
    {
      id: "q2", prepId: "test-prep-id", createdAt: new Date(0), language: "en", difficulty: null, producedByJobId: null, type: "flashcard",
      content: { front: "Cell", back: "Basic unit of life" },
    },
  ]

  it("renders the prep title", () => {
    renderStudy(questions)
    expect(screen.getByText("Biology Basics")).toBeInTheDocument()
  })

  it("renders the shared tabs and no owner-only ones", () => {
    renderStudy(questions)
    expect(screen.getAllByRole("tab").map(tab => tab.textContent?.replace(/\d+$/, ""))).toEqual([ "Main", "Flashcards", "Questions", "Concepts", "Audio", "Video" ])
  })

  it("opens on Main with the start attempt button and concept chips", () => {
    renderStudy(questions)
    expect(screen.getByRole("button", { name: /start attempt/i })).toBeEnabled()
    expect(screen.getByRole("list", { name: "Concept names" })).toHaveTextContent("Mitosis")
  })

  it("shows generation usage in the header and on concepts", async () => {
    renderStudy(questions)
    await userEvent.click(screen.getByRole("tab", { name: /^Concepts/ }))
    expect(screen.getByText("120 tokens · $0.010", { selector: "header span" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Concept generation" })).toBeInTheDocument()
  })

  it("shows a question's generation cost", () => {
    const generated = questions.map(q => ({ ...q, producedByJobId: "j1" }))
    renderStudy(generated)
    expect(screen.getAllByText(/gpt-5-nano/).length).toBeGreaterThan(0)
  })
})
