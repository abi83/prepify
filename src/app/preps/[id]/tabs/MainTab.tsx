import type { Attempt } from "@prisma/client"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { summarizeAttempts, attemptPct } from "@/lib/attemptStats"
import { formatDate } from "@/lib/format"
import type { PrepProgress } from "@/repositories/prepStateRepository"
import type { PrepTab } from "@/types/prep"

import ScoreSparkline from "./ScoreSparkline"
import type { PrepTabProps } from "./types"

const RECENT_ATTEMPTS = 5
const CONCEPT_CHIPS = 12

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

function StatTile({ label, value, status, onClick }: { label: string; value: number; status?: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-col gap-0.5 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-primary"
    >
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {status && <span className="text-xs text-muted-foreground">{status}</span>}
    </button>
  )
}

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
  return `${progress.ocrPages}/${progress.totalPages} recognised`
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

export default function MainTab({ flashcards, studyQuestions, concepts, pages, attempts, progress, onStartAttempt, onOpenTab }: PrepTabProps) {
  const open = (tab: PrepTab) => () => onOpenTab(tab)
  const shownConcepts = concepts.slice(0, CONCEPT_CHIPS)
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11" onClick={onStartAttempt} disabled={studyQuestions.length === 0}>Start attempt</Button>
        {studyQuestions.length === 0 && <span className="text-sm text-muted-foreground">Available once questions are generated.</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Flashcards" value={flashcards.length} onClick={open("flashcards")} />
        <StatTile label="Questions" value={studyQuestions.length} status={questionsStatus(progress)} onClick={open("questions")} />
        <StatTile label="Concepts" value={concepts.length} status={conceptsStatus(progress, concepts.length)} onClick={open("concepts")} />
        <StatTile label="Pages" value={pages.length} status={pagesStatus(progress)} onClick={open("pages")} />
      </div>

      <Section title="Progress"><Progress attempts={attempts} /></Section>

      {concepts.length > 0 && (
        <Section title="Concepts">
          <ul aria-label="Concept names" className="flex flex-wrap gap-1.5">
            {shownConcepts.map(c => (
              <li key={c.id} className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold">{c.name}</li>
            ))}
          </ul>
          {concepts.length > CONCEPT_CHIPS && (
            <Button variant="link" className="h-11 self-start p-0" onClick={open("concepts")}>All {concepts.length} concepts →</Button>
          )}
        </Section>
      )}
    </div>
  )
}
