import { z } from "zod"

import { agentMetaSchema } from "@/lib/agent"
import { reviewSchema } from "@/lib/agents/QuestionReviewer"

import type { Difficulty, QuestionType } from "./questions"
import { generatedQuestionSchema } from "./questions"

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
  difficulty: Difficulty
}

export type PipelineProgressEvent =
  | { stage: "concepts" }
  | { stage: "resuming"; done: number; total: number }
  | { stage: "crafting"; done: number; total: number }
  | { stage: "reviewing"; done: number; total: number }
  | { stage: "rewriting"; done: number; total: number }
  | { stage: "done"; failed: number }

/** Terminal states are `finished` (shipped as a Question) and `failed` (max attempts exhausted,
 *  never retried on resume). `pending` with a non-empty `attempts` array is resumable — continue
 *  at the first step the last attempt is missing. */
export const pipelineQuestionStatusSchema = z.enum([ "pending", "finished", "failed" ])
export type PipelineQuestionStatus = z.infer<typeof pipelineQuestionStatusSchema>

/** One slot's build (+ its independent review, once done) — see `PipelineQuestionStatus`. */
export const pipelineAttemptSchema = z.object({
  attemptNum: z.number(),
  build: z.object({ question: generatedQuestionSchema, meta: agentMetaSchema }),
  review: z.object({ review: reviewSchema, passed: z.boolean(), meta: agentMetaSchema }).nullable(),
})
export type PipelineAttempt = z.infer<typeof pipelineAttemptSchema>

export const pipelineAttemptsSchema = z.array(pipelineAttemptSchema)
