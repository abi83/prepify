import { z } from 'zod'
import type { QuestionType } from './questions'

export const conceptSchema = z.object({
  name: z.string(),
  description: z.string(),
  importance: z.number().min(0).max(1),
  misconceptions: z.array(z.string()),
})

export const conceptsResponseSchema = z.object({
  concepts: z.array(conceptSchema).min(1).max(15),
})

export type Concept = z.infer<typeof conceptSchema>

export interface QuestionTask {
  concept: Concept
  type: QuestionType
}

export type PipelineProgressEvent =
  | { stage: 'concepts' }
  | { stage: 'resuming'; done: number; total: number }
  | { stage: 'crafting'; done: number; total: number }
  | { stage: 'reviewing'; done: number; total: number }
  | { stage: 'done' }
