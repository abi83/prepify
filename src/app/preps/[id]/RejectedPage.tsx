import { Button } from "@/components/ui/button"
import type { JobGeneration } from "@/repositories/prepStateRepository"

import PageCard from "./PageCard"

interface Props {
  prepId: string
  gcsKey: string
  number: number
  reason: string
  /** The page's wasted OCR calls; null when none were billed. */
  generation: JobGeneration | null
  retrying: boolean
  onRetry: () => void
}

export default function RejectedPage({ prepId, gcsKey, number, reason, generation, retrying, onRetry }: Props) {
  return (
    <PageCard
      prepId={prepId}
      gcsKey={gcsKey}
      title={`Page ${number}`}
      badge={<span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tracking-wide text-error uppercase">Rejected</span>}
      generation={generation}
      costLabel="Wasted"
    >
      <div className="flex flex-col items-start gap-3 p-5">
        <p role="alert" className="text-sm text-error">{reason}</p>
        <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry} aria-label={`Retry page ${number}`}>Retry</Button>
      </div>
    </PageCard>
  )
}
