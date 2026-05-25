import { z } from 'zod'
import type { QuestionType } from './questions'

export const conceptSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().min(40).max(300),
  importance: z.number().min(0).max(1),
  misconceptions: z.array(z.string().min(10).max(150)).max(3),
})

export const conceptsResponseSchema = z.object({
  concepts: z.array(conceptSchema).max(20),
})

export type Concept = z.infer<typeof conceptSchema>

export interface QuestionTask {
  concepts: Concept[]
  type: QuestionType
}

export type PipelineProgressEvent =
  | { stage: 'concepts' }
  | { stage: 'resuming'; done: number; total: number }
  | { stage: 'crafting'; done: number; total: number }
  | { stage: 'reviewing'; done: number; total: number }
  | { stage: 'done' }
