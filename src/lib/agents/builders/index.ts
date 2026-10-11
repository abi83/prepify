import type { AgentDeps } from "@/core/ports"
import type { AgentResult } from "@/lib/agent"
import type { QuestionTask } from "@/types/pipeline"
import type { GeneratedQuestion, QuestionType } from "@/types/questions"

import { runFillTheGapBuilder } from "./FillTheGapBuilder"
import { runFlashcardBuilder } from "./FlashcardBuilder"
import { runMultipleChoiceBuilder } from "./MultipleChoiceBuilder"
import type { RewriteInput } from "./rewrite"
import { runSingleChoiceBuilder } from "./SingleChoiceBuilder"
import { runSortingBuilder } from "./SortingBuilder"

export type BuilderFn = (
  task: QuestionTask,
  model: string,
  tier: string,
  language: string,
  signal: AbortSignal,
  rewrite: RewriteInput | undefined,
  deps: AgentDeps,
) => Promise<AgentResult<GeneratedQuestion>>

export const BUILDERS: Record<QuestionType, BuilderFn> = {
  flashcard: runFlashcardBuilder as BuilderFn,
  single_choice: runSingleChoiceBuilder as BuilderFn,
  multiple_choice: runMultipleChoiceBuilder as BuilderFn,
  fill_the_gap: runFillTheGapBuilder as BuilderFn,
  sorting: runSortingBuilder as BuilderFn,
}
