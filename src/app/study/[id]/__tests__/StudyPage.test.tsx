import type { Prep, Question } from "@prisma/client"
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}))

vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return { ...createNavigationMock(), useParams: () => ({ id: "test-prep-id" }) }
})

vi.mock("@/actions/attempts", () => ({
  insertAttempt: vi.fn().mockResolvedValue({}),
}))

import StudyPage from "@/app/study/[id]/StudyPage"

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
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

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
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    expect(screen.getByText("Biology Basics")).toBeInTheDocument()
  })

  it("renders the Flashcards and Questions tabs", () => {
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    expect(screen.getByRole("tab", { name: "Flashcards" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Questions" })).toBeInTheDocument()
  })

  it("shows the start attempt button", () => {
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    expect(screen.getByRole("button", { name: /start attempt/i })).toBeInTheDocument()
  })
})
