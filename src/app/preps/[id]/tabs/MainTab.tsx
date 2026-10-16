import type { ReactNode } from "react"

import PracticeFlow from "@/components/attempt/PracticeFlow"
import FlashCard from "@/components/questions/FlashCard"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/format"

import type { PrepTabProps } from "./types"

const FLASHCARD_PREVIEW_COUNT = 5

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  )
}

export default function MainTab({ questions, flashcards, studyQuestions, attempts, assets, onStartAttempt, onOpenTab }: PrepTabProps) {
  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">No study questions yet.</p>
        <Button className="h-11" onClick={() => onOpenTab("generation")}>Go to Generation</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {flashcards.length > 0 && (
        <Section title="Flashcards">
          <FlashCard cards={flashcards.slice(0, FLASHCARD_PREVIEW_COUNT)} />
          {flashcards.length > FLASHCARD_PREVIEW_COUNT && (
            <Button variant="link" className="h-11 self-center" onClick={() => onOpenTab("flashcards")}>
              All {flashcards.length} flashcards →
            </Button>
          )}
        </Section>
      )}

      {studyQuestions.length > 0 && (
        <Section title="Questions">
          <PracticeFlow questions={studyQuestions} assets={assets} />
        </Section>
      )}

      <Section title="Attempt">
        <Button className="h-11 self-start" onClick={onStartAttempt} disabled={studyQuestions.length === 0}>
          Start attempt
        </Button>
        {attempts.length > 0 && (
          <ul aria-label="Attempt history" className="flex flex-col gap-1.5">
            {attempts.map(a => (
              <li key={a.id} className="flex items-center gap-3 rounded-sm border border-border bg-background px-4 py-3 text-sm">
                <span className="font-semibold text-primary">
                  {a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)
                </span>
                <span className="ml-auto text-muted-foreground">{formatDate(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
