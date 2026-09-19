"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { VisualElement, Page } from "@/types/prep"

function VisualElementItem({ el }: { el: VisualElement }) {
    return (
        <div className="rounded-lg border border-border p-3">
            <div className="mb-1.5 flex items-center gap-2">
                <span className="rounded text-xs font-semibold tracking-wide text-muted-foreground uppercase bg-muted px-1.5 py-0.5">{el.type}</span>
                <span className="ml-auto text-xs text-muted-foreground">{Math.round(el.confidence * 100)}%</span>
            </div>
            <p className="mb-1.5 text-sm text-foreground">{el.description}</p>
            {el.content && <pre className="mb-1.5 rounded bg-muted p-2.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">{el.content}</pre>}
            {el.caption && <p className="mt-0.5 text-sm text-muted-foreground"><strong>Caption:</strong> {el.caption}</p>}
            {el.context && <p className="mt-0.5 text-sm text-muted-foreground"><strong>Context:</strong> {el.context}</p>}
        </div>
    )
}

export default function PageSection({ page }: { page: Page }) {
    const [ open, setOpen ] = useState(false)
    const hasVisuals = page.visual_elements.length > 0
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Page {page.page}</span>
                <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(v => !v)}>
                    {open ? "Collapse" : "Expand"}
                </Button>
            </div>
            {open && (
                <>
                    <div className="max-h-[2000px] overflow-hidden transition-[max-height]">
                        <pre className="p-5 font-body text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">{page.text}</pre>
                    </div>
                    {hasVisuals && (
                        <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
                            {page.visual_elements.map((el, i) => (
                                <VisualElementItem key={i} el={el} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
