import { useEffect, useState } from "react"

import { retryFailedPages } from "@/actions/jobs"
import PageSection from "@/app/preps/[id]/PageSection"
import RejectedPage from "@/app/preps/[id]/RejectedPage"
import { resumeRunRequest, useRunTrigger } from "@/app/preps/[id]/useRunTrigger"
import { ExecutionModeDialog } from "@/components/ExecutionModeDialog"
import { FilePicker } from "@/components/FilePicker"
import { Button } from "@/components/ui/button"
import { MAX_IMAGES } from "@/core/lib/config"
import { validateNewFiles } from "@/lib/prepImageUpload"
import { enqueueUploads, pruneUploaded, useUploads } from "@/lib/uploadQueue"

import type { PrepTabProps } from "./types"

export default function PagesTab({ prep, pages, images, expectRun }: PrepTabProps) {
  const [ retrying, setRetrying ] = useState(false)
  const [ error, setError ] = useState("")
  const uploads = useUploads(prep.id)
  const trigger = useRunTrigger(prep.id, {
    onError: message => {
      setRetrying(false)
      setError(message)
    },
    onFinished: () => setRetrying(false),
    onServerRunStarted: expectRun,
  })

  useEffect(() => {
    pruneUploaded(prep.id, images.map(image => image.id))
  }, [ prep.id, images ])

  const persistedIds = images.map(image => image.id)
  const pendingUploads = uploads.filter(u => u.state.status !== "done" || !persistedIds.includes(u.state.imageId))
  const total = images.length + pendingUploads.length
  const isUploading = uploads.some(u => u.state.status === "uploading")
  const hasFailedUpload = uploads.some(u => u.state.status === "error")
  const newPageCount = images.filter(image => image.status === "pending" && image.ocrResult === null).length

  function handleFiles(files: File[]) {
    const { accepted, error: validationError } = validateNewFiles(files, total)
    setError(validationError ?? "")
    if (accepted.length > 0) enqueueUploads(prep.id, accepted, images.map(image => image.gcsKey))
  }

  function processNewPages() {
    setError("")
    setRetrying(true)
    trigger.run(resumeRunRequest(prep.id))
  }

  async function retry(imageIds: string[]) {
    setError("")
    setRetrying(true)
    try {
      await retryFailedPages(prep.id, imageIds)
    } catch (e) {
      setRetrying(false)
      setError(e instanceof Error ? e.message : "Failed to retry")
      return
    }
    // The resumed OCR jobs run first; the run then extracts and merges the recovered pages' concepts.
    trigger.run(resumeRunRequest(prep.id))
  }

  const failedIds = pages.flatMap(entry => entry.verdict === "rejected" ? [ entry.imageId ] : [])
  return (
    <div className="flex flex-col gap-3">
      <ExecutionModeDialog open={trigger.modeDialogOpen} onConfirm={trigger.confirmMode} />
      {pages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No pages recognised yet.</p>}
      <div className="flex flex-wrap items-center gap-2">
        {total < MAX_IMAGES && <FilePicker variant="compact" onFiles={handleFiles} />}
        {newPageCount > 0 && (
          <Button disabled={retrying || isUploading} onClick={processNewPages}>Process {newPageCount} new {newPageCount === 1 ? "page" : "pages"}</Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{total} / {MAX_IMAGES} pages</span>
      </div>
      {isUploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {hasFailedUpload && <p className="text-xs text-error">Some images failed to upload. Add them again to retry.</p>}
      {failedIds.length > 0 && (
        <Button variant="outline" className="self-start" disabled={retrying} onClick={() => void retry(failedIds)}>Retry all failed</Button>
      )}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {pages.map(entry => entry.verdict === "accepted"
        ? <PageSection key={entry.page.page} prepId={prep.id} page={entry.page} generation={entry.generation} />
        : <RejectedPage key={entry.number} prepId={prep.id} gcsKey={entry.gcsKey} number={entry.number} reason={entry.reason} generation={entry.generation} retrying={retrying} onRetry={() => void retry([ entry.imageId ])} />,
      )}
    </div>
  )
}
