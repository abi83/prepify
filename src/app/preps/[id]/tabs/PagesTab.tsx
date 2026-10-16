import PageSection from "@/app/preps/[id]/PageSection"

import type { PrepTabProps } from "./types"

export default function PagesTab({ prep, pages }: PrepTabProps) {
  if (pages.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No pages recognised yet.</p>
  return (
    <div className="flex flex-col gap-3">
      {pages.map(({ page, generation }) => (
        <PageSection key={page.page} prepId={prep.id} page={page} generation={generation} />
      ))}
    </div>
  )
}
