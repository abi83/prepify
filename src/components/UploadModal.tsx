import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { createPrep, listMyPreps } from "@/actions/preps"
import { validateNewFiles } from "@/lib/prepImageUpload"
import { clearUploads, enqueueUploads, useUploads } from "@/lib/uploadQueue"

import { FilePicker } from "./FilePicker"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

type Props = {
  onClose: () => void
}

async function createDraft(): Promise<string> {
  const existing = await listMyPreps()
  const prep = await createPrep({ title: `Prep #${existing.length + 1}`, language: null })
  return prep.id
}

/** Creates the draft prep from the first picked files, then hands over to its page once an image is persisted. */
export default function UploadModal({ onClose }: Props) {
  const router = useRouter()
  const [ prepId, setPrepId ] = useState<string | null>(null)
  const [ creating, setCreating ] = useState(false)
  const [ errorMsg, setErrorMsg ] = useState("")
  const uploads = useUploads(prepId)

  const persisted = uploads.some(u => u.state.status === "done")
  const uploading = uploads.filter(u => u.state.status === "uploading").length
  const allFailed = uploads.length > 0 && uploads.every(u => u.state.status === "error")
  const isWorking = creating || uploading > 0 || persisted

  useEffect(() => {
    if (prepId && persisted) router.push(`/preps/${prepId}`)
  }, [ prepId, persisted, router ])

  async function handleFiles(files: File[]) {
    const { accepted, error } = validateNewFiles(files, 0)
    setErrorMsg(error ?? "")
    if (accepted.length === 0) return

    setCreating(true)
    try {
      const id = prepId ?? await createDraft()
      setPrepId(id)
      clearUploads(id)
      enqueueUploads(id, accepted, [])
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to create the prep")
    } finally {
      setCreating(false)
    }
  }

  const shownError = errorMsg || (allFailed ? "Upload failed. Please try again." : "")

  return (
    <Dialog open onOpenChange={open => { if (!open && !isWorking) onClose() }}>
      <DialogContent
        showCloseButton={!isWorking}
        onEscapeKeyDown={e => isWorking && e.preventDefault()}
        onPointerDownOutside={e => isWorking && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>New Prep</DialogTitle>
          <DialogDescription className="sr-only">Upload photos of textbook pages to create a new prep.</DialogDescription>
        </DialogHeader>

        {isWorking ? (
          <p className="py-4 text-sm text-muted-foreground">
            {persisted ? "Opening your prep…" : "Uploading your pages…"}
          </p>
        ) : (
          <>
            <FilePicker variant="dropzone" onFiles={files => void handleFiles(files)} />
            {shownError && <p className="text-sm text-error">{shownError}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
