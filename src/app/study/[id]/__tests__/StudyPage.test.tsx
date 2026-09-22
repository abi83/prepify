import type { Prep, Question } from "@prisma/client"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
    pages: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    tokensUsed: 0,
    visibility: "link",
    grade: 10,
    discipline: null,
    language: null,
    description: "",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("StudyPage — loaded with questions", () => {
  const questions: Question[] = [
    {
      id: "q1", prepId: "test-prep-id", createdAt: new Date(0), difficulty: null, type: "single_choice",
      content: {
        question: "What is a cell?", rationale: "",
        answers: [
          { id: "a", text: "Basic unit", is_correct: true, explanation: "" },
          { id: "b", text: "Molecule", is_correct: false, explanation: "" },
        ],
      },
    },
    {
      id: "q2", prepId: "test-prep-id", createdAt: new Date(0), difficulty: null, type: "flashcard",
      content: { front: "Cell", back: "Basic unit of life" },
    },
  ]

  it("renders the prep title", () => {
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    expect(screen.getByText("Biology Basics")).toBeInTheDocument()
  })

  it("renders the Cards, Quiz, and Test tabs", () => {
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    expect(screen.getByRole("tab", { name: "Cards" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Quiz" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Test" })).toBeInTheDocument()
  })

  it("shows quiz start button when Quiz tab is selected", async () => {
    const user = userEvent.setup()
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    await user.click(screen.getByRole("tab", { name: "Quiz" }))
    expect(screen.getByRole("button", { name: /start quiz/i })).toBeInTheDocument()
  })

  it("shows test start button when Test tab is selected", async () => {
    const user = userEvent.setup()
    render(<StudyPage prep={prep()} questions={questions} assets={[]} />)
    await user.click(screen.getByRole("tab", { name: "Test" }))
    expect(screen.getByRole("button", { name: /start test/i })).toBeInTheDocument()
  })
})

describe("StudyPage — anonymous user", () => {
  it("shows sign-in note for unauthenticated visitors", async () => {
    render(<StudyPage prep={prep({ title: "Test Prep", visibility: "public", grade: null })} questions={[]} assets={[]} />)
    expect(await screen.findByText(/sign in/i)).toBeInTheDocument()
  })
})
