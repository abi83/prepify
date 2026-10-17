import type { Prep } from "@prisma/client"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }))
vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return createNavigationMock()
})
vi.mock("@/actions/attempts", () => ({ insertAttempt: vi.fn() }))

import PrepHeader from "@/components/prep/PrepHeader"
import PrepView from "@/components/prep/PrepView"
import { FLASHCARDS_TAB, QUESTIONS_TAB, type SharedTabData } from "@/components/prep/tabs/sharedTabs"

const prep: Prep = {
  id: "p1", userId: "u1", title: "Biology", createdAt: new Date(0), visibility: "link",
  grade: 10, discipline: null, language: null, description: "", isActive: true,
}

const data: SharedTabData = {
  flashcards: [ { front: "Cell", back: "Unit of life", back_explanation: "", asset_hint: { needed: false, type: null, description: null } } ],
  studyQuestions: [],
  assets: [],
  generationOfQuestion: () => null,
}

function renderView(mode: "owner" | "readOnly") {
  const owner = mode === "owner"
  return render(
    <PrepView
      prepId={prep.id}
      studyQuestions={data.studyQuestions}
      assets={[]}
      header={<PrepHeader prep={prep} tokensUsed={0} costUsd={0} actions={owner ? { canShare: true, onShare: vi.fn(), onDelete: vi.fn() } : null} />}
      tab="flashcards"
      tabs={[ FLASHCARDS_TAB, QUESTIONS_TAB ]}
      startAttemptButton={!owner}
      tabData={() => data}
    />,
  )
}

describe("PrepView", () => {
  it.each([ "owner", "readOnly" ] as const)("renders header, tabs with counts and the active tab (%s)", mode => {
    renderView(mode)
    expect(screen.getByRole("heading", { name: "Biology" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /^Flashcards/ })).toHaveTextContent("1")
    expect(screen.getByRole("tab", { name: /^Questions/ })).toBeInTheDocument()
    expect(screen.getByText("Cell")).toBeInTheDocument()
  })

  it("shows the owner menu in owner mode", async () => {
    renderView("owner")
    await userEvent.click(screen.getByRole("button", { name: "Prep actions" }))
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument()
  })

  it("hides the owner menu in read-only mode and offers a standalone Start attempt", () => {
    renderView("readOnly")
    expect(screen.queryByRole("button", { name: "Prep actions" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /start attempt/i })).toBeDisabled()
  })
})
