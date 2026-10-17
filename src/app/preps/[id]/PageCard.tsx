"use client"

import { useEffect, useState, type ReactNode } from "react"

import { getReadSignedUrl } from "@/actions/uploads"
import GenerationCost from "@/components/GenerationCost"
import { Button } from "@/components/ui/button"
import type { JobGeneration } from "@/repositories/prepStateRepository"

interface Props {
  prepId: string
  gcsKey: string
  title: string
  badge: ReactNode
  /** Cost row under the header; null shows none. */
  generation: JobGeneration | null
  costLabel?: string
  /** Shown under the photo when expanded. */
  children: ReactNode
}

/** A page's header, expandable original photo and cost row, shared by accepted and rejected pages. */
export default function PageCard({ prepId, gcsKey, title, badge, generation, costLabel, children }: Props) {
  const [ open, setOpen ] = useState(false)
  const [ imageUrl, setImageUrl ] = useState<string | null>(null)

  useEffect(() => {
    if (!open || imageUrl) return

    let ignore = false
    getReadSignedUrl(prepId, gcsKey).then(url => {
      if (!ignore) setImageUrl(url)
    })
    return () => { ignore = true }
  }, [ open, prepId, gcsKey, imageUrl ])

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge}
        </div>
        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(v => !v)}>
          {open ? "Collapse" : "Expand"}
        </Button>
      </div>
      {generation && (
        <div className="border-b border-border px-5 py-2">
          <GenerationCost generation={generation} label={costLabel} />
        </div>
      )}
      {open && (
        <>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, not a static next/image source
            <img src={imageUrl} alt={`${title} original`} className="block max-h-[600px] w-full object-contain border-b border-border bg-muted" />
          )}
          {children}
        </>
      )}
    </div>
  )
}
