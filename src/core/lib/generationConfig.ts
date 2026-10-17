import type { Difficulty, QuestionType, QuizType } from "@/types/questions"

export const ALL_QUESTION_TYPES: QuizType[] = [
  "single_choice",
  "multiple_choice",
  "fill_the_gap",
  "sorting",
]

export const MAX_FLASHCARDS = 30

export const TYPE_LABELS: Record<QuestionType, string> = {
  flashcard: "Flashcards",
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  fill_the_gap: "Fill the gap",
  sorting: "Sorting",
}

/** Relative weights per tier; normalized against the question count. */
export type DifficultyMix = Record<Difficulty, number>

export interface GenerationConfig {
  /** Quiz questions; flashcards are counted separately. */
  questionCount: number
  flashcardCount: number
  enabledTypes: QuizType[]
  difficultyMix: DifficultyMix
}

export const DEFAULT_GEN_CONFIG: GenerationConfig = {
  questionCount: 10,
  flashcardCount: 10,
  enabledTypes: [ ...ALL_QUESTION_TYPES ],
  difficultyMix: { easy: 3, medium: 4, hard: 3 },
}

function defaultConfig(): GenerationConfig {
  return {
    ...DEFAULT_GEN_CONFIG,
    enabledTypes: [ ...DEFAULT_GEN_CONFIG.enabledTypes ],
    difficultyMix: { ...DEFAULT_GEN_CONFIG.difficultyMix },
  }
}

function isValidMix(mix: unknown): mix is DifficultyMix {
  if (typeof mix !== "object" || mix === null) return false
  const weights = [ "easy", "medium", "hard" ].map(d => (mix as Record<string, unknown>)[d])
  return weights.every(w => typeof w === "number" && Number.isFinite(w) && w >= 0) && weights.some(w => (w as number) > 0)
}

/** Parses a stored config, clamping values and falling back to defaults for anything invalid. */
export function parseGenerationConfig(raw: string | null): GenerationConfig {
  try {
    if (!raw) return defaultConfig()
    const parsed = JSON.parse(raw) as Partial<GenerationConfig>
    const count = Number(parsed.questionCount)
    const flashcards = Number(parsed.flashcardCount ?? DEFAULT_GEN_CONFIG.flashcardCount)
    const enabledTypes = Array.isArray(parsed.enabledTypes)
      ? (parsed.enabledTypes as QuizType[]).filter(t => ALL_QUESTION_TYPES.includes(t))
      : [ ...DEFAULT_GEN_CONFIG.enabledTypes ]
    return {
      questionCount: Number.isFinite(count)
        ? Math.min(20, Math.max(5, count))
        : DEFAULT_GEN_CONFIG.questionCount,
      flashcardCount: Number.isFinite(flashcards)
        ? Math.min(MAX_FLASHCARDS, Math.max(0, flashcards))
        : DEFAULT_GEN_CONFIG.flashcardCount,
      enabledTypes: enabledTypes.length > 0 ? enabledTypes : [ ...DEFAULT_GEN_CONFIG.enabledTypes ],
      difficultyMix: isValidMix(parsed.difficultyMix) ? parsed.difficultyMix : { ...DEFAULT_GEN_CONFIG.difficultyMix },
    }
  } catch {
    return defaultConfig()
  }
}
