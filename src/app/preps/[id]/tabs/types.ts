import type { Prep, Question, Attempt, Asset } from "@prisma/client"

import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"
import type { Page, PrepTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

/** A page's OCR verdict: recognised, or rejected with a plain-language reason. */
export type PageEntry =
  | { verdict: "accepted"; page: Page; generation: JobGeneration | null }
  | { verdict: "rejected"; number: number; gcsKey: string; reason: string }

/** Everything a tab may render; each tab component picks what it needs. */
export interface PrepTabProps {
  prep: Prep
  questions: Question[]
  flashcards: FlashcardContent[]
  studyQuestions: Question[]
  attempts: Attempt[]
  assets: Asset[]
  progress: PrepProgress | null
  concepts: StatedConcept[]
  pages: PageEntry[]
  generations: Record<string, JobGeneration>
  generationOfQuestion: (question: Question) => JobGeneration | null
  onTitleReady: (title: string) => void
  onGenerated: (questions: Question[], prep: Prep) => void
  onStartAttempt: () => void
  onOpenTab: (tab: PrepTab) => void
}
