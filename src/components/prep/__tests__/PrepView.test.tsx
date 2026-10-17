import type { Prep } from "@prisma/client"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return createNavigationMock()
})
vi.mock("@/actions/attempts", () => ({ insertAttempt: vi.fn() }))

import PrepHeader from "@/components/prep/PrepHeader"
import PrepView from "@/components/prep/PrepView"
import { SHARED_TABS, type SharedTabData } from "@/components/prep/tabs/sharedTabs"
import type { StatedConcept } from "@/repositories/prepStateRepository"
import type { PrepTab } from "@/types/prep"

const prep: Prep = {
  id: "p1", userId: "u1", title: "Biology", createdAt: new Date(0), visibility: "link",
  grade: 10, discipline: null, language: null, description: "", isActive: true, status: "ready", runHeartbeatAt: null,
}

const concept: StatedConcept = {
  id: "c1", name: "Mitosis", description: "Cell division.", importance: 0.9, misconceptions: [], language: "en", createdAt: new Date(0),
  generation: { jobId: "j1", type: "concepts", status: "executed", failureReason: null, subject: "Mitosis", model: "gpt-5-nano", tier: "flex", calls: [ { promptTokens: 100, cachedTokens: 0, completionTokens: 20, costUsd: 0.01, executionMs: 1, wasted: false, generatedAt: new Date(0) } ] },
}

const data: SharedTabData = {
  flashcards: [ { front: "Cell", back: "Unit of life", back_explanation: "", asset_hint: { needed: false, type: null, description: null } } ],
  studyQuestions: [],
  assets: [],
  concepts: [ concept ],
  generationOfQuestion: () => null,
  generationOfFlashcard: () => null,
  onStartAttempt: vi.fn(),
  onOpenTab: vi.fn(),
}

function renderView(mode: "owner" | "readOnly", tab: PrepTab = "flashcards") {
  const owner = mode === "owner"
  return render(
    <PrepView
      prepId={prep.id}
      userId={owner ? "u1" : null}
      studyQuestions={data.studyQuestions}
      assets={[]}
      header={<PrepHeader prep={prep} tokensUsed={0} costUsd={0} actions={owner ? { canShare: true, onShare: vi.fn(), onDelete: vi.fn() } : null} />}
      tab={tab}
      tabs={SHARED_TABS}
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

  it("hides the owner menu in read-only mode", () => {
    renderView("readOnly")
    expect(screen.queryByRole("button", { name: "Prep actions" })).not.toBeInTheDocument()
  })

  it("offers the shared tabs, in order, without the owner-only ones", () => {
    renderView("readOnly")
    expect(screen.getAllByRole("tab").map(tab => tab.textContent?.replace(/\d+$/, ""))).toEqual([ "Main", "Flashcards", "Questions", "Concepts", "Audio", "Video" ])
  })

  it("renders the Main tab without owner data", () => {
    renderView("readOnly", "main")
    expect(screen.getByRole("button", { name: /start attempt/i })).toBeDisabled()
    expect(screen.getByRole("list", { name: "Concept names" })).toHaveTextContent("Mitosis")
    expect(screen.queryByRole("button", { name: /^Pages/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Progress" })).not.toBeInTheDocument()
  })

  it("shows concept generation cost on the Concepts tab", () => {
    renderView("readOnly", "concepts")
    expect(screen.getByRole("heading", { name: "Concept generation" }).closest("section")).toHaveTextContent("120 tokens · $0.010")
  })
})
