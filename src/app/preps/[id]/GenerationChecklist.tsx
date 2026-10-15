"use client"

import type { GenerationProgress } from "@/lib/jobs/clientExecution"
import { cn } from "@/lib/utils"
import type { PrepProgress } from "@/repositories/prepStateRepository"

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

export function rowsFromProgress(progress: GenerationProgress | null): ChecklistRowData[] {
  const stage = progress?.stage ?? null
  const ocrDone = stage !== "ocr"
  const conceptsDone = stage === "meta" || stage === "questions" || stage === "assets" || stage === "done"
  const namingDone = stage === "questions" || stage === "assets" || stage === "done"
  const questionsDone = stage === "assets" || stage === "done"
  const assetsDone = stage === "done"

  return [
    {
      label: "Recognise pages",
      status: ocrDone ? "done" : "running",
      detail: progress?.stage === "ocr" ? `${progress.done}/${progress.total}` : undefined,
    },
    { label: "Extract educational concepts", status: conceptsDone ? "done" : ocrDone ? "running" : "pending" },
    { label: "Name the prep", status: namingDone ? "done" : conceptsDone ? "running" : "pending" },
    {
      label: "Craft and validate questions",
      status: questionsDone ? "done" : stage === "questions" ? "running" : "pending",
      detail: progress?.stage === "questions" ? `${progress.done}/${progress.total}` : undefined,
    },
    {
      label: "Draw formulas and diagrams",
      status: assetsDone ? "done" : stage === "assets" ? "running" : "pending",
      detail: progress?.stage === "assets" ? `${progress.done}/${progress.total}` : undefined,
    },
  ]
}

export function rowsFromSummary(s: PrepProgress, prepTitle: string): ChecklistRowData[] {
  const titled = !DEFAULT_TITLE_RE.test(prepTitle)
  const rows: ChecklistRowData[] = [
    {
      label: "Recognise pages",
      status: s.totalPages > 0 && s.ocrPages === s.totalPages ? "done" : "pending",
      detail: s.totalPages > 0 ? `${s.ocrPages}/${s.totalPages}` : undefined,
    },
    { label: "Extract educational concepts", status: s.hasConcepts ? "done" : "pending" },
    { label: "Name the prep", status: titled ? "done" : "pending" },
    {
      label: "Craft and validate questions",
      status: s.totalQuestions > 0 && s.completedQuestions === s.totalQuestions ? "done" : "pending",
      detail: s.totalQuestions > 0 ? `${s.completedQuestions}/${s.totalQuestions}` : undefined,
      failed: s.failedQuestions,
    },
  ]
  if (s.runState !== "running") return rows
  const current = rows.find(row => row.status === "pending")
  if (current) current.status = "running"
  return rows
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
