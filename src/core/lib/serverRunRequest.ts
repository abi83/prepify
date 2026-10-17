import { z } from "zod"

import { difficultySchema, quizTypeSchema } from "@/types/questions"

import { DEFAULT_GEN_CONFIG, MAX_FLASHCARDS } from "./generationConfig"

export const serverRunRequestSchema = z.object({
  apiKey: z.string().min(1),
  prepId: z.string().min(1),
  model: z.string().min(1).default("gpt-5-nano"),
  tier: z.string().min(1).default("flex"),
  target: z.object({
    questionCount: z.number().int().min(5).max(20),
    flashcardCount: z.number().int().min(0).max(MAX_FLASHCARDS),
    enabledTypes: z.array(quizTypeSchema).min(1),
    difficultyMix: z.record(difficultySchema, z.number().min(0)).refine(mix => Object.values(mix).some(w => w > 0)),
    additionalQuestions: z.number().int().min(1).max(20).optional(),
  }).default(DEFAULT_GEN_CONFIG),
})
export type ServerRunRequest = z.infer<typeof serverRunRequestSchema>
