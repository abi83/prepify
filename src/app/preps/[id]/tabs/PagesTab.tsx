import { useState } from "react"

import { retryFailedPages } from "@/actions/jobs"
import PageSection from "@/app/preps/[id]/PageSection"
import RejectedPage from "@/app/preps/[id]/RejectedPage"
import { resumeRunRequest, useRunTrigger } from "@/app/preps/[id]/useRunTrigger"
import { ExecutionModeDialog } from "@/components/ExecutionModeDialog"
import { Button } from "@/components/ui/button"

import type { PrepTabProps } from "./types"

export default function PagesTab({ prep, pages, expectRun }: PrepTabProps) {
  const [ retrying, setRetrying ] = useState(false)
  const [ error, setError ] = useState("")
  const trigger = useRunTrigger(prep.id, {
    onError: message => {
      setRetrying(false)
      setError(message)
    },
    onFinished: () => setRetrying(false),
    onServerRunStarted: expectRun,
  })

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

  if (pages.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No pages recognised yet.</p>

  const failedIds = pages.flatMap(entry => entry.verdict === "rejected" ? [ entry.imageId ] : [])
  return (
    <div className="flex flex-col gap-3">
      <ExecutionModeDialog open={trigger.modeDialogOpen} onConfirm={trigger.confirmMode} />
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
