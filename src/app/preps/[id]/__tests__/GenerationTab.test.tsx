import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import GenerationTab from "@/app/preps/[id]/tabs/GenerationTab"
import type { PrepTabProps } from "@/app/preps/[id]/tabs/types"
import { formatDate } from "@/lib/format"
import type { JobGeneration } from "@/repositories/prepStateRepository"

const { mockRetryJob, mockRefresh, mockRequestServerRun } = vi.hoisted(() => ({
  mockRetryJob: vi.fn(),
  mockRefresh: vi.fn(),
  mockRequestServerRun: vi.fn(),
}))
vi.mock("@/actions/jobs", () => ({ retryJob: mockRetryJob }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => ({ key: "k", model: "m", tier: "flex" }) }))
vi.mock("@/lib/executionMode", async importActual => ({
  ...await importActual<typeof import("@/lib/executionMode")>(),
  getExecutionMode: () => "server",
  isExecutionModeSet: () => true,
}))
vi.mock("@/lib/jobs/client/serverRunClient", () => ({ requestServerRun: mockRequestServerRun, awaitRunStart: vi.fn() }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/jobs/client/clientExecution", () => ({ runGeneration: vi.fn() }))
vi.mock("@/app/preps/[id]/GenerationPanel", () => ({ default: () => null }))

const call = { promptTokens: 1, cachedTokens: 0, completionTokens: 1, costUsd: 0.001, executionMs: 1, wasted: false, generatedAt: new Date(0) }
const gen = (jobId: string, status: JobGeneration["status"], failureReason: string | null): JobGeneration =>
  ({ jobId, type: "question", status, failureReason, updatedAt: new Date(0), subject: "single_choice · easy", model: "gpt-5-nano", tier: "flex", calls: [ call ] })

const renderTab = (generations: Record<string, JobGeneration>) =>
  render(<GenerationTab {...{ prep: { id: "p1" }, questions: [], progress: null, generations, expectRun: vi.fn() } as unknown as PrepTabProps} />)

beforeEach(() => vi.clearAllMocks())

describe("GenerationTab log", () => {
  it("lists a failed job with no calls, dated by its last update, with its reason", () => {
    const updatedAt = new Date("2026-03-04T12:00:00Z")
    renderTab({ a: { ...gen("a", "failed", "429 rate limited"), calls: [], updatedAt } })

    expect(screen.getByText("429 rate limited")).toBeInTheDocument()
    expect(screen.getByText(formatDate(updatedAt))).toBeInTheDocument()
  })
})

describe("GenerationTab retry", () => {
  it("shows the failure reason and a Retry button on failed rows only", () => {
    renderTab({ a: gen("a", "failed", "model refused"), b: gen("b", "executed", null) })

    expect(screen.getByText("model refused")).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1)
  })

  it("retries the clicked job by id, then triggers a run and refreshes", async () => {
    renderTab({ a: gen("a", "failed", "boom"), b: gen("b", "failed", "bang") })

    await userEvent.click(screen.getAllByRole("button", { name: "Retry" })[1])

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockRetryJob).toHaveBeenCalledExactlyOnceWith("b")
    expect(mockRequestServerRun).toHaveBeenCalledTimes(1)
  })

  it("shows the error and skips the run when the retry throws", async () => {
    mockRetryJob.mockRejectedValue(new Error("Job a is not failed"))
    renderTab({ a: gen("a", "failed", "boom") })

    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Job a is not failed")
    expect(mockRequestServerRun).not.toHaveBeenCalled()
  })
})
