import { z } from "zod"

import type { SupportedLanguage } from "@/lib/config"

import type { Difficulty, QuestionType } from "./questions"

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

/** A `Concept` as persisted: stamped with the language of the pages it was extracted from. */
export type StoredConcept = Concept & { language: SupportedLanguage }

export interface QuestionTask {
  concepts: Concept[]
  type: QuestionType
  difficulty: Difficulty
}
