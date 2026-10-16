import { z } from "zod"

import type { AgentDeps } from "@/core/ports"
import { runAgent, type AgentResult } from "@/lib/agent"
import type { SupportedLanguage } from "@/lib/config"
import type { Prompt } from "@/lib/prompt"

export const DISCIPLINES = [
  "History",
  "Geography",
  "Literature",
  "Social Studies",
  "Economics",
  "Philosophy/Ethics",
  "Biology",
  "Chemistry",
  "Physics",
  "Mathematics",
  "Computer Science",
  "English",
  "French",
  "German",
  "Spanish",
  "Italian",
  "Latin",
  "Russian",
] as const

export type Discipline = (typeof DISCIPLINES)[number]

export function isDiscipline(value: string): value is Discipline {
  return DISCIPLINES.some(d => d === value)
}

export const prepMetaSchema = z.object({
  title: z.string(),
  description: z.string().min(50).max(350),
  grade: z.number().int().min(1).max(13).nullable(),
  discipline: z.enum(DISCIPLINES).nullable(),
})

export type PrepMetaResult = z.infer<typeof prepMetaSchema>

const SYSTEM_PROMPT = `You are an expert curriculum designer.
Given the full OCR text of every page of a study material, describe what this material is: a title, a short description, the school grade level and the school subject.

Title requirements:
- Maximum 5 words
- No quotes or punctuation at the end
- Exam-style, content-focused (e.g. "Mitosis and Cell Division", "Supply and Demand Basics", "French Revolution Causes")
- Reflects the most important topics

Description requirements:
- 50–350 characters, one sentence
- Content-focused, informative (e.g. "Covers the causes of the French Revolution, key figures, and the role of Enlightenment ideas")

Grade and discipline:
- grade: the school grade level (1–13, where 1 is first grade and 13 is the final pre-university year), reflecting the year students typically encounter this content
- discipline: the school subject from the allowed list: ${DISCIPLINES.join(", ")}
- Return null for both grade and discipline if the content is not school curriculum material (phone bills, fiction, recipes, business documents, etc.)
- Infer them from the source text itself: vocabulary, depth, notation and exercise style

Return JSON: { "title": "...", "description": "...", "grade": <integer 1–13 or null>, "discipline": <discipline string or null> }`

export const prompt: Prompt = { version: "1.0.0", text: SYSTEM_PROMPT }

function serializePages(pageTexts: string[]): string {
  return pageTexts.map((text, i) => `=== Page ${i + 1} ===\n${text}`).join("\n\n")
}

/** One LLM call over the raw OCR text of every page, in page order. */
export async function runPrepMeta(
  pageTexts: string[],
  language: SupportedLanguage,
  model: string,
  tier: string,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<AgentResult<PrepMetaResult>> {
  if (pageTexts.length === 0) throw new Error("PrepMeta needs at least one page")
  const langInstruction = language !== "en" ? `\nWrite the title and description in the same language as the source text (${language}).` : ""

  return runAgent({
    name: "PrepMeta",
    promptVersion: prompt.version,
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userContent: { textContent: `Source text:\n\n${serializePages(pageTexts)}` },
    schema: prepMetaSchema,
    model,
    tier,
    signal,
    deps,
  })
}
