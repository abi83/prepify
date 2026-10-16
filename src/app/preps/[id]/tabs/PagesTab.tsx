import PageSection from "@/app/preps/[id]/PageSection"
import RejectedPage from "@/app/preps/[id]/RejectedPage"

import type { PrepTabProps } from "./types"

export default function PagesTab({ prep, pages }: PrepTabProps) {
  if (pages.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No pages recognised yet.</p>
  return (
    <div className="flex flex-col gap-3">
      {pages.map(entry => entry.verdict === "accepted"
        ? <PageSection key={entry.page.page} prepId={prep.id} page={entry.page} generation={entry.generation} />
        : <RejectedPage key={entry.number} number={entry.number} reason={entry.reason} />,
      )}
    </div>
  )
}
