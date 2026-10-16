import type { Question } from "@prisma/client"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"

const insertAttemptMock = vi.fn().mockResolvedValue({})

vi.mock("@/actions/attempts", () => ({
  insertAttempt: (...args: unknown[]) => insertAttemptMock(...args),
}))

import AttemptFlow from "@/components/attempt/AttemptFlow"

const singleQ: Question = {
  id: "q1", prepId: "p1", createdAt: new Date(0), language: "en", difficulty: null, producedByJobId: null, type: "single_choice",
  content: {
    question: "What is 2+2?", rationale: "",
    asset_hint: { needed: false, type: null, description: null },
    answers: [
      { id: "a", text: "4", is_correct: true, explanation: "" },
      { id: "b", text: "5", is_correct: false, explanation: "" },
    ],
  },
}

async function runThroughAttempt(userId: string | null) {
  const user = userEvent.setup()

  render(<AttemptFlow questions={[ singleQ ]} assets={[]} prepId="prep-1" userId={userId} onExit={vi.fn()} />)

  // Click the span containing the answer text — userEvent bubbles up to the button.
  await user.click(await screen.findByText("4"))
  await user.click(screen.getByRole("button", { name: /submit attempt/i }))
  await user.click(await screen.findByRole("button", { name: /confirm/i }))
}

beforeEach(() => {
  insertAttemptMock.mockClear()
})

describe("AttemptFlow — attempt saving", () => {
  it("saves attempt when userId is provided", async () => {
    await runThroughAttempt("user-123")
    await waitFor(() => {
      expect(insertAttemptMock).toHaveBeenCalledWith("prep-1", expect.any(Number), expect.any(Number))
    })
  })

  it("skips DB insert when userId is null", async () => {
    await runThroughAttempt(null)
    await waitFor(() => screen.getByText(/attempt complete/i))
    expect(insertAttemptMock).not.toHaveBeenCalled()
  })

  it("shows score screen with review after finalize", async () => {
    await runThroughAttempt(null)
    await waitFor(() => expect(screen.getByText(/attempt complete/i)).toBeInTheDocument())
    expect(screen.getByText("Review")).toBeInTheDocument()
  })

  it("shows sign-in hint in confirm dialog when anonymous", async () => {
    const user = userEvent.setup()
    render(<AttemptFlow questions={[ singleQ ]} assets={[]} prepId="prep-1" userId={null} onExit={vi.fn()} />)
    await user.click(screen.getByText("4"))
    await user.click(screen.getByRole("button", { name: /submit attempt/i }))
    await waitFor(() => {
      expect(screen.getByText(/sign in to save/i)).toBeInTheDocument()
    })
  })
})
