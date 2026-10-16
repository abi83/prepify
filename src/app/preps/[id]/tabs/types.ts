import type { Prep, Question, Attempt, Asset } from "@prisma/client"

import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"
import type { Page, PrepTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

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
  pages: { page: Page; generation: JobGeneration | null }[]
  generations: Record<string, JobGeneration>
  generationOfQuestion: (question: Question) => JobGeneration | null
  onTitleReady: (title: string) => void
  onGenerated: (questions: Question[], prep: Prep) => void
  onStartAttempt: () => void
  onOpenTab: (tab: PrepTab) => void
}
