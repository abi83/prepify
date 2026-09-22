"use client"

import { cn } from "@/lib/utils"
import type { PartialRunSummary } from "@/repositories/pipelineRepository"
import type { PipelineProgressEvent } from "@/types/pipeline"

export type GenPhase = "idle" | "running" | "done"
type RowStatus = "pending" | "running" | "done"

export interface ChecklistRowData {
  label: string
  status: RowStatus
  detail?: string
  /** A failed-slot count, rendered after `detail` in the error color. Doesn't affect `status`. */
  failed?: number
}

const DEFAULT_TITLE_RE = /^Prep #\d+$/

export function rowsFromProgress(
  progress: PipelineProgressEvent | null,
  craft: { done: number; total: number } | null,
  rewrite: { done: number; total: number } | null,
  review: { done: number; total: number } | null,
  titleReady: boolean,
): ChecklistRowData[] {
  const stage = progress?.stage ?? null
  const conceptsDone = stage !== null && stage !== "concepts"
  const namingActive = conceptsDone && stage !== "done"
  const namingDone = titleReady || stage === "done"
  const craftingDone = stage === "reviewing" || stage === "rewriting" || stage === "done"
  const craftingRunning = stage === "crafting" || stage === "resuming"
  const reviewingDone = stage === "done"
  const reviewingRunning = stage === "reviewing"
  const failed = progress?.stage === "done" ? progress.failed : 0

  const rows: ChecklistRowData[] = [
    { label: "Extract educational concepts", status: conceptsDone ? "done" : "running" },
    { label: "Name the prep", status: namingDone ? "done" : namingActive ? "running" : "pending" },
    { label: "Craft questions", status: craftingDone ? "done" : craftingRunning ? "running" : "pending", detail: craft ? `${craft.done}/${craft.total}` : undefined },
  ]

  // Only shown once a rewrite has actually started — most runs never need one.
  if (rewrite) {
    rows.push({ label: "Revise rejected questions", status: stage === "done" ? "done" : stage === "rewriting" ? "running" : "pending", detail: `${rewrite.done}/${rewrite.total}` })
  }

  rows.push({
    label: "Validate questions",
    status: reviewingDone ? "done" : reviewingRunning ? "running" : "pending",
    detail: review ? `${review.done}/${review.total}` : undefined,
    failed,
  })

  return rows
}

export function rowsFromSummary(s: PartialRunSummary, prepTitle: string): ChecklistRowData[] {
  const total = s.totalTasks || 10
  const n = s.completedSlots
  const titled = !DEFAULT_TITLE_RE.test(prepTitle)
  return [
    { label: "Extract educational concepts", status: s.hasConcepts ? "done" : "pending" },
    { label: "Name the prep", status: titled ? "done" : "pending" },
    { label: "Craft questions", status: n > 0 ? "done" : "pending", detail: s.totalTasks > 0 ? `${n}/${total}` : undefined },
    {
      label: "Validate questions",
      status: n > 0 ? "done" : "pending",
      detail: s.totalTasks > 0 ? `${n}/${total}` : undefined,
      failed: s.failedSlots,
    },
  ]
}

export function ChecklistRow({ row }: { row: ChecklistRowData }) {
  const parts = [ row.detail, row.failed ? `${row.failed} failed` : null ].filter(Boolean)
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className={cn("flex size-5 shrink-0 items-center justify-center text-sm font-bold",
        row.status === "done" ? "text-primary" : row.status === "running" ? "text-muted-foreground" : "text-border",
      )}>
        {row.status === "done" ? "✓" : row.status === "running"
          ? <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
          : "○"}
      </span>
      <span className={cn("leading-snug", row.status === "pending" && "text-muted-foreground")}>
        {row.label}
        {parts.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {" "}({row.detail}{row.detail && row.failed ? ", " : ""}{row.failed ? <span className="text-error">{row.failed} failed</span> : null})
          </span>
        )}
      </span>
    </div>
  )
}
