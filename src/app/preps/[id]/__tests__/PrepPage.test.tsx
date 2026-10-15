import type { Prep } from "@prisma/client"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return createNavigationMock()
})
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/actions/prepState", () => ({ getMyPrepProgress: vi.fn() }))
vi.mock("@/actions/preps", () => ({ getMyPrep: vi.fn(), getPrepTokens: vi.fn(), deletePrep: vi.fn() }))
vi.mock("@/actions/questions", () => ({ listMyQuestions: vi.fn() }))
vi.mock("@/actions/uploads", () => ({ getReadSignedUrl: vi.fn() }))
vi.mock("@/actions/attempts", () => ({ insertAttempt: vi.fn() }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/assetGeneration", () => ({ generateAndSaveAssets: vi.fn() }))
vi.mock("@/lib/jobs/clientExecution", () => ({ runGeneration: vi.fn() }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => null }))

import PrepPage from "@/app/preps/[id]/PrepPage"
import type { StoredConcept } from "@/types/pipeline"

const prep: Prep = {
  id: "p1", userId: "u1", title: "Biology", createdAt: new Date(0), visibility: "private",
  grade: 10, discipline: null, language: null, description: "", isActive: true,
}

function renderPage(concepts: StoredConcept[]) {
  return render(
    <PrepPage prep={prep} questions={[]} attempts={[]} assets={[]} progress={null} tokensUsed={0} concepts={concepts} images={[]} />,
  )
}

describe("PrepPage concepts", () => {
  it("lists each concept with its fields", () => {
    renderPage([
      { name: "Mitosis", description: "Cell division producing two identical daughter cells.", importance: 0.9, misconceptions: [ "Mitosis makes gametes" ], language: "en" },
      { name: "Osmosis", description: "Diffusion of water across a semipermeable membrane.", importance: 0.5, misconceptions: [], language: "en" },
    ])
    const items = within(screen.getByRole("list", { name: "Concepts" })).getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent("Mitosis")
    expect(items[0]).toHaveTextContent("Cell division producing two identical daughter cells.")
    expect(items[0]).toHaveTextContent("Importance: 0.9")
    expect(items[0]).toHaveTextContent("Mitosis makes gametes")
    expect(items[0]).toHaveTextContent("Language: en")
  })

  it("renders an empty list when the prep has no concepts", () => {
    renderPage([])
    expect(within(screen.getByRole("list", { name: "Concepts" })).queryAllByRole("listitem")).toHaveLength(0)
  })
})
