import type { PrepTabEntry } from "@/components/prep/PrepTabs"
import { AUDIO_TAB, CONCEPTS_TAB, FLASHCARDS_TAB, QUESTIONS_TAB, VIDEO_TAB } from "@/components/prep/tabs/sharedTabs"

import GenerationTab from "./GenerationTab"
import MainTab from "./MainTab"
import PagesTab from "./PagesTab"
import type { PrepTabProps } from "./types"

const noCount = () => null

/** Tab order is display order: the shared tabs plus the owner-only Pages and Generation, with an owner Main. */
export const PREP_TAB_REGISTRY: PrepTabEntry<PrepTabProps>[] = [
  { id: "main", label: "Main", count: noCount, Component: MainTab },
  FLASHCARDS_TAB,
  QUESTIONS_TAB,
  CONCEPTS_TAB,
  { id: "pages", label: "Pages", count: d => d.pages.length, Component: PagesTab },
  AUDIO_TAB,
  VIDEO_TAB,
  { id: "generation", label: "Generation", count: noCount, Component: GenerationTab },
]
