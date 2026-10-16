import type { ComponentType } from "react"

import type { PrepTab } from "@/types/prep"

import AudioTab from "./AudioTab"
import ConceptsTab from "./ConceptsTab"
import FlashcardsTab from "./FlashcardsTab"
import GenerationTab from "./GenerationTab"
import MainTab from "./MainTab"
import PagesTab from "./PagesTab"
import QuestionsTab from "./QuestionsTab"
import type { PrepTabProps } from "./types"
import VideoTab from "./VideoTab"

export interface PrepTabEntry {
  id: PrepTab
  label: string
  /** Item count shown in the tab label; null hides it. */
  count: (data: PrepTabProps) => number | null
  Component: ComponentType<PrepTabProps>
}

const noCount = () => null

/** Tab order is display order. A new asset type is one component + one entry here (and its id in `PREP_TABS`). */
export const PREP_TAB_REGISTRY: PrepTabEntry[] = [
  { id: "main", label: "Main", count: noCount, Component: MainTab },
  { id: "flashcards", label: "Flashcards", count: d => d.flashcards.length, Component: FlashcardsTab },
  { id: "questions", label: "Questions", count: d => d.studyQuestions.length, Component: QuestionsTab },
  { id: "concepts", label: "Concepts", count: d => d.concepts.length, Component: ConceptsTab },
  { id: "pages", label: "Pages", count: d => d.pages.length, Component: PagesTab },
  { id: "audio", label: "Audio", count: noCount, Component: AudioTab },
  { id: "video", label: "Video", count: noCount, Component: VideoTab },
  { id: "generation", label: "Generation", count: noCount, Component: GenerationTab },
]
