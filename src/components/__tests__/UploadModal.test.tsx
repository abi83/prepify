import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  runOcr: vi.fn(),
  requestServerRun: vi.fn(),
  awaitRunStart: vi.fn(),
  updatePrep: vi.fn(),
}))

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1" } } }) }))
vi.mock("@/actions/prepImages", () => ({ listMyPrepImages: vi.fn().mockResolvedValue([]) }))
vi.mock("@/actions/preps", () => ({ updatePrep: h.updatePrep }))
vi.mock("@/lib/jobs/clientExecution", () => ({ runOcr: h.runOcr }))
vi.mock("@/lib/jobs/serverRunClient", () => ({ requestServerRun: h.requestServerRun, awaitRunStart: h.awaitRunStart }))
vi.mock("@/lib/sampler/clientSampler", () => ({ clientSampler: {} }))
vi.mock("@/lib/apiKey", () => ({ getApiKey: () => ({ provider: "openai", model: "gpt-5-mini", tier: "flex", key: "sk-secret" }) }))
vi.mock("@/components/FilePicker", () => ({
  FilePicker: ({ onRecognise, children }: { onRecognise: (args: unknown) => void; children: ReactNode }) => (
    <>
      {children}
      <button onClick={() => onRecognise({ prepId: "prep-1", files: [ new File([ "x" ], "a.png") ], images: [] })}>Recognise & Create</button>
    </>
  ),
}))

import UploadModal from "@/components/UploadModal"

const onDone = vi.fn()

function renderModal() {
  return render(<UploadModal onClose={vi.fn()} onDone={onDone} />)
}

async function overrideTo(mode: RegExp) {
  await userEvent.click(screen.getByRole("button", { name: /additional settings/i }))
  await userEvent.click(screen.getByRole("radio", { name: mode }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  h.runOcr.mockResolvedValue(undefined)
  h.requestServerRun.mockResolvedValue("triggered")
  h.awaitRunStart.mockResolvedValue(undefined)
  h.updatePrep.mockResolvedValue(undefined)
})

describe("UploadModal execution mode", () => {
  it("collapses Additional settings and defaults to client OCR", async () => {
    renderModal()
    expect(screen.queryByRole("radio")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /additional settings/i }))
    expect(screen.getByRole("radio", { name: /client/i })).toBeChecked()

    await userEvent.click(screen.getByRole("button", { name: "Recognise & Create" }))
    expect(h.runOcr).toHaveBeenCalledOnce()
    expect(h.requestServerRun).not.toHaveBeenCalled()
  })

  it("runs on the server with the saved preference, then redirects to the prep", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    renderModal()
    await userEvent.click(screen.getByRole("button", { name: "Recognise & Create" }))

    expect(h.updatePrep).toHaveBeenCalledWith("prep-1", { isActive: true })
    expect(h.requestServerRun).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-secret", prepId: "prep-1", model: "gpt-5-mini", tier: "flex" }))
    expect(h.awaitRunStart).toHaveBeenCalledWith("prep-1")
    expect(h.runOcr).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith("prep-1")
  })

  it("lets a run override the saved preference", async () => {
    renderModal()
    await overrideTo(/server-assisted/i)
    await userEvent.click(screen.getByRole("button", { name: "Recognise & Create" }))

    expect(h.requestServerRun).toHaveBeenCalledOnce()
    expect(h.runOcr).not.toHaveBeenCalled()
  })

  it("shows the error and stays open when the server rejects the run", async () => {
    localStorage.setItem("prepify_execution_mode", "server")
    h.requestServerRun.mockRejectedValue(new Error("You are signed out. Sign in again."))
    renderModal()
    await userEvent.click(screen.getByRole("button", { name: "Recognise & Create" }))

    expect(await screen.findByText(/signed out/i)).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })
})
