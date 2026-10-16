import type { Question } from "@prisma/client"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"

const insertAttemptMock = vi.fn()
vi.mock("@/actions/attempts", () => ({ insertAttempt: (...args: unknown[]) => insertAttemptMock(...args) }))

import PracticeFlow from "@/components/attempt/PracticeFlow"

function single(id: string, text: string): Question {
  return {
    id, prepId: "p1", createdAt: new Date(0), language: "en", difficulty: null, producedByJobId: null, type: "single_choice",
    content: {
      question: text, rationale: "",
      asset_hint: { needed: false, type: null, description: null },
      answers: [
        { id: "a", text: "right", is_correct: true, explanation: "" },
        { id: "b", text: "wrong", is_correct: false, explanation: "" },
      ],
    },
  }
}

describe("PracticeFlow", () => {
  it("gives instant feedback, advances inline, and persists nothing", async () => {
    const user = userEvent.setup()
    render(<PracticeFlow questions={[ single("q1", "First?"), single("q2", "Second?") ]} assets={[]} />)

    await user.click(screen.getByText("wrong"))
    await user.click(screen.getByRole("button", { name: /submit answer/i }))
    expect(screen.getByText(/incorrect/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /next/i }))
    expect(screen.getByText(/question 2 of 2/i)).toBeInTheDocument()
    expect(insertAttemptMock).not.toHaveBeenCalled()
  })

  it("skips flashcards", () => {
    const flashcard: Question = { ...single("f1", ""), type: "flashcard", content: { front: "a", back: "b" } }
    render(<PracticeFlow questions={[ flashcard, single("q1", "Only?") ]} assets={[]} />)
    expect(screen.getByText(/question 1 of 1/i)).toBeInTheDocument()
  })
})
