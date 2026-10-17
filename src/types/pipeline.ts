import { z } from "zod"

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/config"

import type { Difficulty, QuestionType } from "./questions"

export const conceptSchema = z.object({
  name: z.string().min(3).max(80),
  description: z.string().min(40).max(300),
  importance: z.number().min(0).max(1),
  misconceptions: z.array(z.string().min(10).max(150)).max(3),
})

export const EMPTY_CONCEPTS_REASONS = [ "not_educational", "unreadable", "no_assessable_content" ] as const
export const emptyConceptsReasonSchema = z.enum(EMPTY_CONCEPTS_REASONS)
export type EmptyConceptsReason = z.infer<typeof emptyConceptsReasonSchema>

/** `emptyReason` is set exactly when `concepts` is empty. */
export const conceptsResponseSchema = z.object({
  concepts: z.array(conceptSchema).max(20),
  emptyReason: emptyConceptsReasonSchema.nullable(),
}).refine(r => (r.concepts.length === 0) === (r.emptyReason !== null), {
  message: "emptyReason must be set if and only if concepts is empty",
})

export type Concept = z.infer<typeof conceptSchema>

/** A `Concept` as persisted: stamped with the language of the pages it was extracted from. */
export type StoredConcept = Concept & { language: SupportedLanguage }

export const storedConceptSchema = conceptSchema.extend({ language: z.enum(SUPPORTED_LANGUAGES) })

/** What the `concepts.extract` job found on one page. */
export const pageConceptsSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("found"), concepts: z.array(storedConceptSchema).min(1) }),
  z.object({ status: z.literal("empty"), reason: emptyConceptsReasonSchema }),
])
export type PageConcepts = z.infer<typeof pageConceptsSchema>

export interface QuestionTask {
  concepts: Concept[]
  type: QuestionType
  difficulty: Difficulty
}
