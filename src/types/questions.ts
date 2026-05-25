import { z } from 'zod'

// --- Content schemas ---

export const flashcardContentSchema = z.object({
  front: z.string(),
  back: z.string(),
  back_explanation: z.string(),
})

export const answerSchema = z.object({
  id: z.string(),
  text: z.string(),
  is_correct: z.boolean(),
  explanation: z.string(),
})

export const singleChoiceContentSchema = z.object({
  question: z.string(),
  answers: z.array(answerSchema).length(4),
  rationale: z.string(),
})

export const multipleChoiceContentSchema = z.object({
  question: z.string(),
  answers: z.array(answerSchema).min(4).max(6),
  rationale: z.string(),
})

export const fillGapAnswerSchema = z.object({
  id: z.string(),
  label: z.string(),
  multiple_usage: z.boolean(),
})

export const fillGapSchema = z.object({
  index: z.number(),
  correct_answer_id: z.string(),
  explanation: z.string(),
})

export const fillTheGapContentSchema = z.object({
  question: z.string(),
  gaps: z.array(fillGapSchema).min(2).max(4),
  answers: z.array(fillGapAnswerSchema).min(4).max(6),
  rationale: z.string(),
}).refine(
  ({ question, gaps }) => {
    // Every gap must have a corresponding {{gap:N}} marker in the question text
    return gaps.every(g => question.includes(`{{gap:${g.index}}}`))
  },
  { message: 'fill_the_gap question must use {{gap:N}} markers matching each gap index — not underscores or other placeholders' }
).refine(
  ({ gaps, answers }) => {
    // Every gap's correct_answer_id must exist in the answers array
    const answerIds = new Set(answers.map(a => a.id))
    return gaps.every(g => answerIds.has(g.correct_answer_id))
  },
  { message: 'fill_the_gap: every gap.correct_answer_id must reference an id in the answers array' }
)

export const sortingAnswerSchema = z.object({
  id: z.string(),
  text: z.string(),
  correct_index: z.number().min(1).max(4),
  explanation: z.string(),
})

export const sortingContentSchema = z.object({
  question: z.string(),
  answers: z.array(sortingAnswerSchema).length(4),
  rationale: z.string(),
})

// --- Question type union ---

export const questionTypeSchema = z.enum([
  'flashcard',
  'single_choice',
  'multiple_choice',
  'fill_the_gap',
  'sorting',
])

export type QuestionType = z.infer<typeof questionTypeSchema>

export type FlashcardContent = z.infer<typeof flashcardContentSchema>
export type SingleChoiceContent = z.infer<typeof singleChoiceContentSchema>
export type MultipleChoiceContent = z.infer<typeof multipleChoiceContentSchema>
export type FillTheGapContent = z.infer<typeof fillTheGapContentSchema>
export type SortingContent = z.infer<typeof sortingContentSchema>

export type QuestionContent =
  | FlashcardContent
  | SingleChoiceContent
  | MultipleChoiceContent
  | FillTheGapContent
  | SortingContent

export interface Question {
  id: string
  prep_id: string
  type: QuestionType
  content: QuestionContent
  created_at: string
}

// --- Attempt ---

export interface Attempt {
  id: string
  prep_id: string
  user_id: string
  mode: 'quiz' | 'test'
  score: number
  total: number
  created_at: string
}

// --- Prep context (from PrepContextAgent) ---

export const prepContextSchema = z.object({
  title: z.string(),
  description: z.string(),
})

export type PrepContext = z.infer<typeof prepContextSchema>

// --- Questions array (from QuestionsAgent) ---

export const generatedQuestionSchema = z.union([
  z.object({ type: z.literal('flashcard'), content: flashcardContentSchema }),
  z.object({ type: z.literal('single_choice'), content: singleChoiceContentSchema }),
  z.object({ type: z.literal('multiple_choice'), content: multipleChoiceContentSchema }),
  z.object({ type: z.literal('fill_the_gap'), content: fillTheGapContentSchema }),
  z.object({ type: z.literal('sorting'), content: sortingContentSchema }),
])

export const generatedQuestionsSchema = z.array(generatedQuestionSchema).min(1)

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>
