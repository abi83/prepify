import type { PrepTabEntry } from "@/components/prep/PrepTabs"
import { FLASHCARDS_TAB, QUESTIONS_TAB } from "@/components/prep/tabs/sharedTabs"

import AudioTab from "./AudioTab"
import ConceptsTab from "./ConceptsTab"
import GenerationTab from "./GenerationTab"
import MainTab from "./MainTab"
import PagesTab from "./PagesTab"
import type { PrepTabProps } from "./types"
import VideoTab from "./VideoTab"

const noCount = () => null

/** Tab order is display order. A new asset type is one component + one entry here (and its id in `PREP_TABS`). */
export const PREP_TAB_REGISTRY: PrepTabEntry<PrepTabProps>[] = [
  { id: "main", label: "Main", count: noCount, Component: MainTab },
  FLASHCARDS_TAB,
  QUESTIONS_TAB,
  { id: "concepts", label: "Concepts", count: d => d.concepts.length, Component: ConceptsTab },
  { id: "pages", label: "Pages", count: d => d.pages.length, Component: PagesTab },
  { id: "audio", label: "Audio", count: noCount, Component: AudioTab },
  { id: "video", label: "Video", count: noCount, Component: VideoTab },
  { id: "generation", label: "Generation", count: noCount, Component: GenerationTab },
]
