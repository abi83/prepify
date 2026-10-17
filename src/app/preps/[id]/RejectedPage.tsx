import type { JobGeneration } from "@/repositories/prepStateRepository"

import PageCard from "./PageCard"

interface Props {
  prepId: string
  gcsKey: string
  number: number
  reason: string
  /** The page's wasted OCR calls; null when none were billed. */
  generation: JobGeneration | null
}

export default function RejectedPage({ prepId, gcsKey, number, reason, generation }: Props) {
  return (
    <PageCard
      prepId={prepId}
      gcsKey={gcsKey}
      title={`Page ${number}`}
      badge={<span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold tracking-wide text-error uppercase">Rejected</span>}
      generation={generation}
      costLabel="Wasted"
    >
      <p role="alert" className="p-5 text-sm text-error">{reason}</p>
    </PageCard>
  )
}
