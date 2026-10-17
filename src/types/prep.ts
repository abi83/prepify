import { z } from "zod"

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./language"

/** Identifier-safe discipline values stored on `Prep.discipline`; mirrors the Prisma `PrepDiscipline` enum. */
export type PrepDisciplineId =
  | "History" | "Geography" | "Literature" | "SocialStudies" | "Economics" | "PhilosophyEthics"
  | "Biology" | "Chemistry" | "Physics" | "Mathematics" | "ComputerScience"
  | "English" | "French" | "German" | "Spanish" | "Italian" | "Latin" | "Russian"

/** Stored on `Prep.status`; mirrors the Prisma `PrepStatus` enum. */
export type PrepStatus = "draft" | "processing" | "ready" | "failed"

const languageSchema = z.enum(SUPPORTED_LANGUAGES)

export const prepDisciplineSchema: z.ZodType<PrepDisciplineId> = z.enum([
  "History", "Geography", "Literature", "SocialStudies", "Economics", "PhilosophyEthics",
  "Biology", "Chemistry", "Physics", "Mathematics", "ComputerScience",
  "English", "French", "German", "Spanish", "Italian", "Latin", "Russian",
])

/** Client-supplied fields for a new prep; strict, so `userId`, `id`, … are rejected. */
export const createPrepInputSchema = z.strictObject({
  title: z.string(),
  language: languageSchema.nullable(),
})

/** Client-supplied fields for a prep update; strict, so `userId`, `id`, … are rejected. */
export const updatePrepInputSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  visibility: z.enum([ "private", "link", "public" ]),
  grade: z.number().int().nullable(),
  discipline: prepDisciplineSchema.nullable(),
  language: languageSchema.nullable(),
  isActive: z.boolean(),
}).partial()

export const STUDY_TABS = [ "flashcards", "questions" ] as const
export type StudyTab = (typeof STUDY_TABS)[number]

export function isStudyTab(value: string): value is StudyTab {
  return STUDY_TABS.some(tab => tab === value)
}

/** Reads the `tab` query param, falling back to the default for anything absent or invalid. */
export function parseStudyTab(value: string | null): StudyTab {
  return value !== null && isStudyTab(value) ? value : "flashcards"
}

export const PREP_TABS = [ "main", "flashcards", "questions", "concepts", "pages", "audio", "video", "generation" ] as const
export type PrepTab = (typeof PREP_TABS)[number]

export function isPrepTab(value: string): value is PrepTab {
  return PREP_TABS.some(tab => tab === value)
}

/** Reads the prep page's `tab` query param, falling back to Main for anything absent or invalid. */
export function parsePrepTab(value: string | null): PrepTab {
  return value !== null && isPrepTab(value) ? value : "main"
}

export type VisualElementType = "diagram" | "formula" | "table" | "chart" | "molecule" | "image"

export type VisualElement = {
  type: VisualElementType
  description: string
  content: string
  caption: string | null
  context: string | null
  confidence: number
}

export type Page = {
  page: number
  title: string
  language: SupportedLanguage
  text: string
  gcsKey: string
  visual_elements: VisualElement[]
}

const visualElementSchema: z.ZodType<VisualElement> = z.object({
  type: z.enum([ "diagram", "formula", "table", "chart", "molecule", "image" ]),
  description: z.string(),
  content: z.string(),
  caption: z.string().nullable(),
  context: z.string().nullable(),
  confidence: z.number(),
})

/** Shape written to `PrepImage.ocrResult` once OCR for that image finishes successfully. */
export const ocrResultSchema = z.object({
  title: z.string(),
  text: z.string(),
  visual_elements: z.array(visualElementSchema),
})
export type OcrResult = z.infer<typeof ocrResultSchema>
