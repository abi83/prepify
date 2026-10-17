import type { PrepImage } from "@prisma/client"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import PagesTab from "@/app/preps/[id]/tabs/PagesTab"
import type { PageEntry, PrepTabProps } from "@/app/preps/[id]/tabs/types"

const { mockRetryFailedPages, mockRefresh, mockRequestServerRun } = vi.hoisted(() => ({
  mockRetryFailedPages: vi.fn(),
  mockRefresh: vi.fn(),
  mockRequestServerRun: vi.fn(),
}))
vi.mock("@/actions/jobs", () => ({ retryFailedPages: mockRetryFailedPages }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => ({ key: "k", model: "m", tier: "flex" }) }))
vi.mock("@/lib/executionMode", async importActual => ({
  ...await importActual<typeof import("@/lib/executionMode")>(),
  getExecutionMode: () => "server",
  isExecutionModeSet: () => true,
}))
vi.mock("@/lib/jobs/client/serverRunClient", () => ({ requestServerRun: mockRequestServerRun, awaitRunStart: vi.fn() }))
vi.mock("@/lib/prepImageUpload", () => ({ validateNewFiles: vi.fn() }))
vi.mock("@/lib/uploadQueue", () => ({ enqueueUploads: vi.fn(), pruneUploaded: vi.fn(), useUploads: () => [] }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/jobs/client/clientExecution", () => ({ runGeneration: vi.fn() }))
vi.mock("@/app/preps/[id]/PageCard", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock("@/app/preps/[id]/PageSection", () => ({ default: () => <div>accepted</div> }))

const rejected = (n: number): PageEntry => ({ verdict: "rejected", imageId: `img${n}`, number: n, gcsKey: `k${n}`, reason: "boom", generation: null })
const accepted: PageEntry = { verdict: "accepted", generation: null, page: { page: 1, gcsKey: "k1", language: "en", title: "T", text: "x", visual_elements: [] } }

const renderTab = (pages: PageEntry[], images: Partial<PrepImage>[] = []) => render(<PagesTab {...{ prep: { id: "p1" }, pages, images, expectRun: vi.fn() } as unknown as PrepTabProps} />)

beforeEach(() => vi.clearAllMocks())

describe("PagesTab adding pages", () => {
  it("counts existing pages against the limit and offers the picker below it", () => {
    renderTab([ accepted ], [ { id: "img1", status: "done" as PrepImage["status"], ocrResult: {} } ])

    expect(screen.getByText("1 / 10 pages")).toBeTruthy()
    expect(screen.getByRole("button", { name: "+ Add files" })).toBeTruthy()
  })

  it("runs the resume after the user processes uploaded, unrecognised pages", async () => {
    renderTab([ accepted ], [ { id: "img1", status: "pending", ocrResult: {} }, { id: "img2", status: "pending", ocrResult: null } ])

    await userEvent.click(screen.getByRole("button", { name: "Process 1 new page" }))

    await waitFor(() => expect(mockRequestServerRun).toHaveBeenCalledTimes(1))
    expect(mockRetryFailedPages).not.toHaveBeenCalled()
  })

  it("hides the process button without unrecognised pages", () => {
    renderTab([ accepted ], [ { id: "img1", status: "pending", ocrResult: {} } ])

    expect(screen.queryByRole("button", { name: /^Process/ })).toBeNull()
  })
})

describe("PagesTab retry", () => {
  it("retries one rejected page, then triggers a run and refreshes", async () => {
    renderTab([ accepted, rejected(2), rejected(3), rejected(4) ])

    expect(screen.getAllByRole("button", { name: /^Retry page/ })).toHaveLength(3)
    await userEvent.click(screen.getByRole("button", { name: "Retry page 3" }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockRetryFailedPages).toHaveBeenCalledWith("p1", [ "img3" ])
    expect(mockRequestServerRun).toHaveBeenCalledTimes(1)
  })

  it("'Retry all failed' sends every rejected page's id", async () => {
    renderTab([ accepted, rejected(2), rejected(3) ])

    await userEvent.click(screen.getByRole("button", { name: "Retry all failed" }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockRetryFailedPages).toHaveBeenCalledWith("p1", [ "img2", "img3" ])
  })

  it("shows no retry controls without rejected pages", () => {
    renderTab([ accepted ])

    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull()
  })
})
