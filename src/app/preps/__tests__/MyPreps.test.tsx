import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"

import type { PrepEntry } from "@/repositories/prepRepository"
/* eslint-disable import/order */
import { createNavigationMock } from "@/testUtils/navigationMock"

const mocks = vi.hoisted(() => ({ nav: undefined as unknown as ReturnType<typeof createNavigationMock> }))

vi.mock("next/navigation", () => {
  mocks.nav = createNavigationMock()
  return mocks.nav
})

vi.mock("@/components/UploadModal", () => ({ default: () => null }))

import MyPreps from "@/app/preps/MyPreps"
/* eslint-enable import/order */

function entry(overrides: Partial<PrepEntry>): PrepEntry {
  return {
    id: "prep-1",
    userId: "owner-1",
    title: "Untitled",
    createdAt: new Date("2026-01-15T00:00:00Z"),
    visibility: "private",
    grade: null,
    discipline: null,
    language: null,
    description: "",
    isActive: true,
    status: "ready",
    questionCount: 0,
    flashcardCount: 0,
    conceptCount: 0,
    ...overrides,
  }
}

const preps = [
  entry({ id: "prep-1", title: "Cell Biology", grade: 10, discipline: "Biology", language: "en", questionCount: 4, flashcardCount: 6, conceptCount: 2 }),
  entry({ id: "prep-2", title: "World War II", grade: 9, discipline: "History", visibility: "public" }),
]

async function selectOption(user: ReturnType<typeof userEvent.setup>, triggerName: RegExp, optionName: string) {
  await user.click(screen.getByRole("combobox", { name: triggerName }))
  await user.click(await screen.findByRole("option", { name: optionName }))
}

beforeEach(() => {
  mocks.nav.useRouter().replace("/") // clear filters left over from the previous test
})

describe("MyPreps", () => {
  it("links cards to the prep page and shows the visibility badge", () => {
    render(<MyPreps preps={preps} />)
    expect(screen.getByRole("link", { name: /cell biology/i })).toHaveAttribute("href", "/preps/prep-1")
    expect(screen.getByText("private")).toBeInTheDocument()
    expect(screen.getByText("public")).toBeInTheDocument()
  })

  it("shows language badge and counts, 0 for an empty prep", () => {
    render(<MyPreps preps={preps} />)
    expect(screen.getByText("4 questions · 6 flashcards · 2 concepts")).toBeInTheDocument()
    expect(screen.getByText("0 questions · 0 flashcards · 0 concepts")).toBeInTheDocument()
  })

  it("filters by discipline", async () => {
    const user = userEvent.setup()
    render(<MyPreps preps={preps} />)

    await selectOption(user, /filter by subject/i, "History")

    expect(screen.getByText("World War II")).toBeInTheDocument()
    expect(screen.queryByText("Cell Biology")).not.toBeInTheDocument()
  })

  it("filters by grade and shows empty message when nothing matches", async () => {
    const user = userEvent.setup()
    render(<MyPreps preps={preps} />)

    await selectOption(user, /filter by grade/i, "Grade 13")

    expect(screen.getByText(/no preps match/i)).toBeInTheDocument()
  })
})
