import type { Asset, Question } from "@prisma/client"

import type { PrepTabEntry } from "@/components/prep/PrepTabs"
import type { JobGeneration } from "@/repositories/prepStateRepository"
import type { FlashcardContent } from "@/types/questions"

import FlashcardsTab from "./FlashcardsTab"
import QuestionsTab from "./QuestionsTab"

/** Data the tabs common to the owner and read-only views render. */
export interface SharedTabData {
  flashcards: FlashcardContent[]
  studyQuestions: Question[]
  assets: Asset[]
  generationOfQuestion: (question: Question) => JobGeneration | null
}

export const FLASHCARDS_TAB: PrepTabEntry<SharedTabData> = {
  id: "flashcards", label: "Flashcards", count: d => d.flashcards.length, Component: FlashcardsTab,
}

export const QUESTIONS_TAB: PrepTabEntry<SharedTabData> = {
  id: "questions", label: "Questions", count: d => d.studyQuestions.length, Component: QuestionsTab,
}
