import type { ReactNode } from "react"

import DifficultyBadge, { countByDifficulty, DIFFICULTY_TIERS } from "@/components/DifficultyBadge"
import { Button } from "@/components/ui/button"
import type { StatedConcept } from "@/repositories/prepStateRepository"
import type { PrepTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

const CONCEPT_CHIPS = 12

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

export function StatTile({ label, value, status, onClick }: { label: string; value: number; status: string | null; onClick: () => void }) {
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

interface Props {
  flashcards: FlashcardContent[]
  studyQuestions: { difficulty: string | null }[]
  concepts: StatedConcept[]
  onStartAttempt: () => void
  onOpenTab: (tab: PrepTab) => void
  /** Generation status under the Questions and Concepts tiles; null shows none. */
  questionsStatus: string | null
  conceptsStatus: string | null
  /** Tiles after Concepts, for views with more tabs. */
  extraTiles: ReactNode
  /** Section between the tiles and the concept chips. */
  progress: ReactNode
}

/** The Main tab body shared by every view: start attempt, stat tiles, concept chips. */
export default function PrepOverview({ flashcards, studyQuestions, concepts, onStartAttempt, onOpenTab, questionsStatus, conceptsStatus, extraTiles, progress }: Props) {
  const open = (tab: PrepTab) => () => onOpenTab(tab)
  const difficultyCounts = countByDifficulty(studyQuestions)
  const shownConcepts = concepts.slice(0, CONCEPT_CHIPS)
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11" onClick={onStartAttempt} disabled={studyQuestions.length === 0}>Start attempt</Button>
        {studyQuestions.length === 0 && <span className="text-sm text-muted-foreground">Available once questions are generated.</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Flashcards" value={flashcards.length} status={null} onClick={open("flashcards")} />
        <StatTile label="Questions" value={studyQuestions.length} status={questionsStatus} onClick={open("questions")} />
        <StatTile label="Concepts" value={concepts.length} status={conceptsStatus} onClick={open("concepts")} />
        {extraTiles}
      </div>

      {studyQuestions.length > 0 && (
        <Section title="Difficulty">
          <ul aria-label="Questions by difficulty" className="flex flex-wrap gap-3">
            {DIFFICULTY_TIERS.map(tier => (
              <li key={tier} className="flex items-center gap-2 text-sm">
                <DifficultyBadge difficulty={tier} />
                <span className="font-bold">{difficultyCounts[tier]}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {progress}

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
