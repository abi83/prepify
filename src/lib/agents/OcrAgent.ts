import { z } from "zod"

import { LANGUAGE_LABELS } from "@/core/lib/config"
import type { Logger } from "@/core/logger"
import type { AgentDeps, AgentImage } from "@/core/ports"
import { runAgent, truncateForLog, AgentResult } from "@/lib/agent"
import type { AgentMeta } from "@/lib/agent"
import { serializeError } from "@/lib/logger"
import type { Prompt } from "@/lib/prompt"
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/types/language"

const visualElementSchema = z.object({
  type: z.enum([ "diagram", "formula", "table", "chart", "molecule", "image" ]),
  description: z.string(),
  content: z.string(),
  caption: z.string().nullable(),
  context: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

// Free ISO 639-1 detection — any 2-letter code. Supported-language check happens after parse.
const ocrSchema = z.object({
  title: z.string(),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string().regex(/^[a-z]{2}$/),
  visual_elements: z.array(visualElementSchema),
})

export type OcrOutput = Omit<z.infer<typeof ocrSchema>, "language"> & { language: SupportedLanguage }
export type VisualElementOutput = z.infer<typeof visualElementSchema>

const SUPPORTED_LANGUAGE_NAMES = SUPPORTED_LANGUAGES.map(l => LANGUAGE_LABELS[l]).join(", ")

const SYSTEM_PROMPT = "You are an OCR agent. Extract all text and visual elements from the textbook page image provided."

export const prompt: Prompt = { version: "1.1.0", text: SYSTEM_PROMPT }

const USER_PROMPT = `Extract as much text as you can see from this textbook page. Also describe any visual elements (diagrams, formulas, tables, charts, molecules, images). Do your best even if the image is imperfect.

For the title field, return the most informative title for this page: the chapter heading or topic if visible, otherwise the page number.

For the language field, return the detected language as a 2-letter ISO 639-1 code (e.g. en, de, fr). Do not include regional variants — use "en" not "en_GB".

Confidence rubric (top-level):
- 0.9–1.0: Sharp image, all text clearly readable
- 0.7–0.9: Mostly readable, minor blur or cropping
- 0.5–0.7: Partial — some words/lines unclear or missing
- 0.0–0.5: Poor quality — large portions unreadable

If no visual elements are present, return an empty array for visual_elements.`

const MIN_PAGE_CONFIDENCE = 0.5
const MIN_ELEMENT_CONFIDENCE = 0.6
const MIN_TEXT_LENGTH = 20
const MIN_READABLE_RATIO = 0.7
const MIN_LETTER_RATIO = 0.3

export function assertReadableText(text: string): void {
  const trimmed = text.trim()
  if (trimmed.length < MIN_TEXT_LENGTH) {
    throw new Error(`ocr_text_too_short:${trimmed.length}`)
  }
  const nonWhitespace = trimmed.replace(/\s/g, "")
  const count = (pattern: RegExp) => nonWhitespace.match(pattern)?.length ?? 0
  const letterRatio = count(/\p{L}/gu) / nonWhitespace.length
  // Math pages are mostly digits and symbols; the letter floor still rejects digit-only and "|~=" noise.
  const readableRatio = count(/[\p{L}\p{N}\p{Sm}]/gu) / nonWhitespace.length
  if (letterRatio < MIN_LETTER_RATIO || readableRatio < MIN_READABLE_RATIO) {
    throw new Error(`ocr_text_not_letters:${letterRatio.toFixed(2)}/${readableRatio.toFixed(2)}`)
  }
}

function assertReadableTextLogged(text: string, logger: Logger): void {
  try {
    assertReadableText(text)
  } catch (error) {
    logger.warn("agent:ocr: page text rejected", { error: serializeError(error), text: truncateForLog(text) })
    throw error
  }
}

function assertSupportedLanguage(code: string): asserts code is SupportedLanguage {
  if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
    throw new Error(`unsupported_language:${code}. Supported languages: ${SUPPORTED_LANGUAGE_NAMES}`)
  }
}

/** Thrown when the LLM call succeeded but its output was rejected; `meta` is the wasted call. */
export class OcrRejectedError extends Error {
  constructor(public readonly meta: AgentMeta, public readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = "OcrRejectedError"
  }
}

function assertAcceptable(output: z.infer<typeof ocrSchema>, logger: Logger): asserts output is OcrOutput {
  if (output.confidence < MIN_PAGE_CONFIDENCE) {
    throw new Error(`low_confidence:${output.confidence}`)
  }

  assertReadableTextLogged(output.text, logger)
  assertSupportedLanguage(output.language)
}

export async function runOcrAgent(
  images: AgentImage[],
  model: string,
  tier: string,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<AgentResult<OcrOutput>> {
  const result = await runAgent({
    name: "ocr",
    promptVersion: prompt.version,
    systemPrompt: SYSTEM_PROMPT,
    userContent: { textContent: USER_PROMPT, images },
    schema: ocrSchema,
    model,
    tier,
    signal,
    deps,
  })

  try {
    assertAcceptable(result.output, deps.logger)
  } catch (error) {
    throw new OcrRejectedError(result.meta, error)
  }

  return {
    ...result,
    output: {
      ...result.output,
      language: result.output.language,
      visual_elements: result.output.visual_elements.filter(e => e.confidence >= MIN_ELEMENT_CONFIDENCE),
    },
  }
}
