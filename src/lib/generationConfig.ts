import type { QuestionType } from '../types/questions'

const STORAGE_KEY = 'prepify_gen_config'

export const ALL_QUESTION_TYPES: QuestionType[] = [
  'flashcard',
  'single_choice',
  'multiple_choice',
  'fill_the_gap',
  'sorting',
]

export const TYPE_LABELS: Record<QuestionType, string> = {
  flashcard: 'Flashcards',
  single_choice: 'Single choice',
  multiple_choice: 'Multiple choice',
  fill_the_gap: 'Fill the gap',
  sorting: 'Sorting',
}

export interface GenerationConfig {
  questionCount: number
  enabledTypes: QuestionType[]
}

export const DEFAULT_GEN_CONFIG: GenerationConfig = {
  questionCount: 10,
  enabledTypes: [...ALL_QUESTION_TYPES],
}

export function getGenerationConfig(): GenerationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_GEN_CONFIG, enabledTypes: [...DEFAULT_GEN_CONFIG.enabledTypes] }
    const parsed = JSON.parse(raw) as Partial<GenerationConfig>
    const count = Number(parsed.questionCount)
    const enabledTypes = Array.isArray(parsed.enabledTypes)
      ? (parsed.enabledTypes as QuestionType[]).filter(t => ALL_QUESTION_TYPES.includes(t))
      : [...DEFAULT_GEN_CONFIG.enabledTypes]
    return {
      questionCount: Number.isFinite(count)
        ? Math.min(20, Math.max(5, count))
        : DEFAULT_GEN_CONFIG.questionCount,
      enabledTypes: enabledTypes.length > 0 ? enabledTypes : [...DEFAULT_GEN_CONFIG.enabledTypes],
    }
  } catch {
    return { ...DEFAULT_GEN_CONFIG, enabledTypes: [...DEFAULT_GEN_CONFIG.enabledTypes] }
  }
}

export function setGenerationConfig(config: GenerationConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}
