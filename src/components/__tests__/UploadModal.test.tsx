import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  createPrep: vi.fn(),
  listMyPreps: vi.fn(),
  uploadPrepImage: vi.fn(),
}))

vi.mock("next/navigation", async () => {
  const { createNavigationMock } = await import("@/testUtils/navigationMock")
  return createNavigationMock()
})
vi.mock("@/actions/prepImages", () => ({ createPrepImage: vi.fn() }))
vi.mock("@/actions/uploads", () => ({ getUploadSignedUrl: vi.fn() }))
vi.mock("@/actions/preps", () => ({ createPrep: h.createPrep, listMyPreps: h.listMyPreps }))
vi.mock("@/lib/prepImageUpload", async importActual => ({ ...await importActual<typeof import("@/lib/prepImageUpload")>(), uploadPrepImage: h.uploadPrepImage }))

import UploadModal from "@/components/UploadModal"

const png = (name = "a.png", size = 1) => new File([ new Uint8Array(size) ], name, { type: "image/png" })

async function pick(...files: File[]) {
  const input = document.querySelector<HTMLInputElement>("input[type=file]:not([capture])")!
  await userEvent.upload(input, files)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.listMyPreps.mockResolvedValue([])
  h.createPrep.mockResolvedValue({ id: "prep-1" })
  h.uploadPrepImage.mockResolvedValue({ id: "img-1" })
})

describe("UploadModal", () => {
  it("creates the draft and redirects to its page once the first image is persisted", async () => {
    render(<UploadModal onClose={vi.fn()} />)
    await pick(png("a.png"), png("b.png"))

    await waitFor(() => expect(useRouter().push).toHaveBeenCalledWith("/preps/prep-1"))
    expect(h.createPrep).toHaveBeenCalledWith({ title: "Prep #1", language: null })
    expect(h.uploadPrepImage).toHaveBeenCalledTimes(2)
  })

  it("does not redirect while the first upload is still running", async () => {
    h.uploadPrepImage.mockReturnValue(new Promise(() => {}))
    render(<UploadModal onClose={vi.fn()} />)
    await pick(png())

    expect(await screen.findByText("Uploading your pages…")).toBeInTheDocument()
    expect(useRouter().push).not.toHaveBeenCalled()
  })

  it("shows the error and stays open when every upload fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    h.uploadPrepImage.mockRejectedValue(new Error("boom"))
    render(<UploadModal onClose={vi.fn()} />)
    await pick(png())

    expect(await screen.findByText("Upload failed. Please try again.")).toBeInTheDocument()
    expect(useRouter().push).not.toHaveBeenCalled()
    expect(screen.getByText("Upload photos of textbook pages")).toBeInTheDocument()
  })

  it("rejects oversized files without creating a draft", async () => {
    render(<UploadModal onClose={vi.fn()} />)
    await pick(png("big.png", 5 * 1024 * 1024 + 1))

    expect(await screen.findByText(/big\.png exceeds the 5 MB limit/)).toBeInTheDocument()
    expect(h.createPrep).not.toHaveBeenCalled()
  })

  it("shows the error and stays open when the draft cannot be created", async () => {
    h.createPrep.mockRejectedValue(new Error("db down"))
    render(<UploadModal onClose={vi.fn()} />)
    await pick(png())

    expect(await screen.findByText("db down")).toBeInTheDocument()
    expect(useRouter().push).not.toHaveBeenCalled()
  })
})
