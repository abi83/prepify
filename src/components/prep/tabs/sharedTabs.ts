import type { Asset, Question } from "@prisma/client"

import type { PrepTabEntry } from "@/components/prep/PrepTabs"
import type { JobGeneration, StatedConcept } from "@/repositories/prepStateRepository"
import type { PrepTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

import AudioTab from "./AudioTab"
import ConceptsTab from "./ConceptsTab"
import FlashcardsTab from "./FlashcardsTab"
import MainTab from "./MainTab"
import QuestionsTab from "./QuestionsTab"
import VideoTab from "./VideoTab"

/** Data the tabs common to the owner and read-only views render. */
export interface SharedTabData {
  flashcards: FlashcardContent[]
  studyQuestions: Question[]
  assets: Asset[]
  concepts: StatedConcept[]
  generationOfQuestion: (question: Question) => JobGeneration | null
  onStartAttempt: () => void
  onOpenTab: (tab: PrepTab) => void
}

/** The generation of the job that produced an entity; null when that job is gone. */
export function generationOf(jobId: string | null, generations: Record<string, JobGeneration>): JobGeneration | null {
  if (jobId === null) return null
  return generations[jobId] ?? null
}

export function toFlashcards(questions: Question[]): FlashcardContent[] {
  return questions.filter(q => q.type === "flashcard").map(q => q.content as unknown as FlashcardContent)
}

export function toStudyQuestions(questions: Question[]): Question[] {
  return questions.filter(q => q.type !== "flashcard")
}

const noCount = () => null

export const MAIN_TAB: PrepTabEntry<SharedTabData> = { id: "main", label: "Main", count: noCount, Component: MainTab }
export const FLASHCARDS_TAB: PrepTabEntry<SharedTabData> = {
  id: "flashcards", label: "Flashcards", count: d => d.flashcards.length, Component: FlashcardsTab,
}
export const QUESTIONS_TAB: PrepTabEntry<SharedTabData> = {
  id: "questions", label: "Questions", count: d => d.studyQuestions.length, Component: QuestionsTab,
}
export const CONCEPTS_TAB: PrepTabEntry<SharedTabData> = {
  id: "concepts", label: "Concepts", count: d => d.concepts.length, Component: ConceptsTab,
}
export const AUDIO_TAB: PrepTabEntry<SharedTabData> = { id: "audio", label: "Audio", count: noCount, Component: AudioTab }
export const VIDEO_TAB: PrepTabEntry<SharedTabData> = { id: "video", label: "Video", count: noCount, Component: VideoTab }

/** The read-only view's tabs. The owner's `PREP_TAB_REGISTRY` composes the same entries around its own. */
export const SHARED_TABS: PrepTabEntry<SharedTabData>[] = [ MAIN_TAB, FLASHCARDS_TAB, QUESTIONS_TAB, CONCEPTS_TAB, AUDIO_TAB, VIDEO_TAB ]
