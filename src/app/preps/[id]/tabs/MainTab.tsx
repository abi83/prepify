import type { Attempt } from "@prisma/client"

import PrepOverview, { Section, StatTile } from "@/components/prep/tabs/PrepOverview"
import { summarizeAttempts, attemptPct } from "@/lib/attemptStats"
import { formatDate } from "@/lib/format"
import type { PrepProgress } from "@/repositories/prepStateRepository"

import ScoreSparkline from "./ScoreSparkline"
import type { PrepTabProps } from "./types"

const RECENT_ATTEMPTS = 5

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  )
}

function questionsStatus(progress: PrepProgress | null): string | null {
  if (!progress) return null
  const { runState, completedQuestions, totalQuestions, failedQuestions, terminalQuestions } = progress
  const problems = [ failedQuestions && `${failedQuestions} failed`, terminalQuestions && `${terminalQuestions} gave up` ].filter(Boolean)
  if (runState === "interrupted") return [ "interrupted", ...problems ].join(" · ")
  if (completedQuestions === totalQuestions && problems.length === 0) return null
  return [ `${completedQuestions}/${totalQuestions} generated`, ...problems ].join(" · ")
}

function pagesStatus(progress: PrepProgress | null): string | null {
  if (!progress || progress.ocrPages === progress.totalPages) return null
  const rejected = progress.rejectedPages > 0 ? ` · ${progress.rejectedPages} unreadable` : ""
  return `${progress.ocrPages}/${progress.totalPages} recognised${rejected}`
}

function conceptsStatus(progress: PrepProgress | null, count: number): string | null {
  if (count > 0 || !progress) return null
  return progress.runState === "running" ? "extracting…" : "pending"
}

function Progress({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) return <p className="text-sm text-muted-foreground">No attempts yet.</p>
  const stats = summarizeAttempts(attempts)
  const delta = stats.deltaPct === null ? null : `${stats.deltaPct > 0 ? "+" : ""}${stats.deltaPct} pts`
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <Metric label="Attempts" value={String(stats.count)} />
        <Metric label="Best" value={`${stats.bestPct}%`} />
        <Metric label="Average" value={`${stats.averagePct}%`} />
        <Metric label="Last" value={delta ? `${stats.lastPct}% (${delta})` : `${stats.lastPct}%`} />
        {attempts.length > 1 && <div className="ml-auto"><ScoreSparkline attempts={attempts} /></div>}
      </div>
      <ul aria-label="Attempt history" className="flex flex-col gap-1.5">
        {attempts.slice(0, RECENT_ATTEMPTS).map(a => (
          <li key={a.id} className="flex items-center gap-3 rounded-sm border border-border bg-background px-4 py-3 text-sm">
            <span className="font-semibold text-primary">{a.score}/{a.total} ({attemptPct(a)}%)</span>
            <span className="ml-auto text-muted-foreground">{formatDate(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export default function MainTab({ pages, attempts, progress, ...shared }: PrepTabProps) {
  return (
    <PrepOverview
      {...shared}
      questionsStatus={questionsStatus(progress)}
      conceptsStatus={conceptsStatus(progress, shared.concepts.length)}
      extraTiles={
        <StatTile
          label="Pages"
          value={pages.filter(entry => entry.verdict === "accepted").length}
          status={pagesStatus(progress)}
          onClick={() => shared.onOpenTab("pages")}
        />
      }
      progress={<Section title="Progress"><Progress attempts={attempts} /></Section>}
    />
  )
}
