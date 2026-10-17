import { z } from "zod"

// --- Asset hint (emitted by question builders, consumed by asset router) ---

export const assetTypeSchema = z.enum([ "formula", "molecule", "diagram", "table", "svg" ])
export type AssetType = z.infer<typeof assetTypeSchema>

export const assetHintSchema = z.object({
  needed: z.boolean(),
  type: assetTypeSchema.nullable(),
  description: z.string().nullable(),
}).refine(
  ({ needed, type, description }) => needed
    ? type !== null && description !== null
    : type === null && description === null,
  { message: "asset_hint: needed=true requires type and description; needed=false requires both null" }
)
export type AssetHint = z.infer<typeof assetHintSchema>
export type ActiveAssetHint = AssetHint & { needed: true; type: AssetType; description: string }

// --- Content schemas ---

export const flashcardContentSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  back_explanation: z.string().min(1),
  asset_hint: assetHintSchema,
})

const ANSWER_IDS = [ "A", "B", "C", "D", "E", "F" ]

/** Ids must be A, B, C… in order, which also makes them unique. */
function hasSequentialIds(answers: { id: string }[]) {
  return answers.every((a, i) => a.id === ANSWER_IDS[i])
}

function hasUniqueText(answers: { text: string }[]) {
  return new Set(answers.map(a => a.text.trim().toLowerCase())).size === answers.length
}

export const answerSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(300),
  is_correct: z.boolean(),
  explanation: z.string().min(1).max(250),
}).refine(
  ({ is_correct, explanation }) => explanation.startsWith(is_correct ? "Correct:" : "Incorrect:"),
  { message: "answer explanation must start with 'Correct:' iff is_correct, else 'Incorrect:'" }
)

export const singleChoiceContentSchema = z.object({
  question: z.string().min(1).max(800),
  answers: z.array(answerSchema).length(4),
  rationale: z.string().min(1).max(240),
  asset_hint: assetHintSchema,
}).refine(
  ({ answers }) => hasSequentialIds(answers),
  { message: "single_choice answer ids must be exactly A, B, C, D in order" }
).refine(
  ({ answers }) => answers.filter(a => a.is_correct).length === 1,
  { message: "single_choice must have exactly one is_correct=true answer" }
).refine(
  ({ answers }) => hasUniqueText(answers),
  { message: "single_choice answers must have distinct text" }
)

export const multipleChoiceContentSchema = z.object({
  question: z.string().min(1).max(800),
  answers: z.array(answerSchema).min(4).max(6),
  rationale: z.string().min(1).max(240),
  asset_hint: assetHintSchema,
}).refine(
  ({ answers }) => hasSequentialIds(answers),
  { message: "multiple_choice answer ids must be unique and sequential from A" }
).refine(
  ({ answers }) => {
    const correct = answers.filter(a => a.is_correct).length
    const incorrect = answers.length - correct
    return correct >= 2 && correct <= 4 && incorrect >= 2 && incorrect <= 3
  },
  { message: "multiple_choice must have 2-4 correct and 2-3 incorrect answers" }
).refine(
  ({ answers }) => hasUniqueText(answers),
  { message: "multiple_choice answers must have distinct text" }
)

export const fillGapAnswerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(35),
  multiple_usage: z.boolean(),
})

export const fillGapSchema = z.object({
  index: z.number(),
  correct_answer_id: z.string(),
  explanation: z.string().min(1).max(150),
})

const GAP_MARKER = /\{\{gap:(\d+)\}\}/g

export const fillTheGapContentSchema = z.object({
  question: z.string().min(1),
  gaps: z.array(fillGapSchema).min(2).max(4),
  answers: z.array(fillGapAnswerSchema).min(4).max(6),
  rationale: z.string().min(1).max(300),
  asset_hint: assetHintSchema,
}).refine(
  ({ question, gaps }) => {
    // Markers and gaps must match in both directions
    const markers = [ ...question.matchAll(GAP_MARKER) ].map(m => Number(m[1]))
    const indices = new Set(gaps.map(g => g.index))
    return markers.every(m => indices.has(m)) && gaps.every(g => markers.includes(g.index))
  },
  { message: "fill_the_gap question must use {{gap:N}} markers matching each gap index — not underscores or other placeholders" }
).refine(
  ({ gaps }) => gaps.every((g, i) => g.index === i + 1),
  { message: "fill_the_gap: gap indices must be unique and contiguous from 1" }
).refine(
  ({ answers }) => new Set(answers.map(a => a.id)).size === answers.length,
  { message: "fill_the_gap: answer ids must be unique" }
).refine(
  ({ gaps, answers }) => {
    const reusable = new Set(answers.filter(a => a.multiple_usage).map(a => a.id))
    const used = new Set<string>()
    return gaps.every(g => {
      if (used.has(g.correct_answer_id) && !reusable.has(g.correct_answer_id)) return false
      used.add(g.correct_answer_id)
      return true
    })
  },
  { message: "fill_the_gap: two gaps can't share a correct_answer_id unless that answer has multiple_usage" }
).refine(
  ({ gaps, answers }) => {
    const used = new Set(gaps.map(g => g.correct_answer_id))
    return answers.some(a => !used.has(a.id))
  },
  { message: "fill_the_gap: at least one answer must be unused by any gap (a distractor)" }
).refine(
  ({ gaps, answers }) => {
    // Every gap's correct_answer_id must exist in the answers array
    const answerIds = new Set(answers.map(a => a.id))
    return gaps.every(g => answerIds.has(g.correct_answer_id))
  },
  { message: "fill_the_gap: every gap.correct_answer_id must reference an id in the answers array" }
)

export const sortingAnswerSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(160),
  correct_index: z.number().int().min(1).max(4),
  explanation: z.string().min(1).max(200),
})

export const sortingContentSchema = z.object({
  question: z.string().min(1).max(800),
  answers: z.array(sortingAnswerSchema).length(4),
  rationale: z.string().min(1).max(240),
  asset_hint: assetHintSchema,
}).refine(
  ({ answers }) => hasSequentialIds(answers),
  { message: "sorting answer ids must be exactly A, B, C, D in order" }
).refine(
  ({ answers }) => new Set(answers.map(a => a.correct_index)).size === 4,
  { message: "sorting correct_index values must be a permutation of {1,2,3,4}" }
)

// --- Generated question (builder output, pre-DB) ---

export const generatedQuestionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("flashcard"), content: flashcardContentSchema }),
  z.object({ type: z.literal("single_choice"), content: singleChoiceContentSchema }),
  z.object({ type: z.literal("multiple_choice"), content: multipleChoiceContentSchema }),
  z.object({ type: z.literal("fill_the_gap"), content: fillTheGapContentSchema }),
  z.object({ type: z.literal("sorting"), content: sortingContentSchema }),
])
export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>

// --- Question type union ---

export const questionTypeSchema = z.enum([
  "flashcard",
  "single_choice",
  "multiple_choice",
  "fill_the_gap",
  "sorting",
])

export type QuestionType = z.infer<typeof questionTypeSchema>

/** Question types that make up a quiz; flashcards are studied separately. */
export const quizTypeSchema = questionTypeSchema.exclude([ "flashcard" ])
export type QuizType = z.infer<typeof quizTypeSchema>

export const difficultySchema = z.enum([ "easy", "medium", "hard" ])
export type Difficulty = z.infer<typeof difficultySchema>

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

/** A user's in-progress answer to a question; only the field matching the question type is used. */
export interface AnswerState {
  single: string | null
  multi: string[]
  fill: string[]
  sort: string[]
}
