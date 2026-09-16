import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import type { AgentImage } from '../agent'

const visualElementSchema = z.object({
  type: z.enum(['diagram', 'formula', 'table', 'chart', 'molecule', 'image']),
  description: z.string(),
  content: z.string(),
  caption: z.string().nullable(),
  context: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

const ocrSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  language: z.string(),
  visual_elements: z.array(visualElementSchema),
})

export type OcrOutput = z.infer<typeof ocrSchema>
export type VisualElementOutput = z.infer<typeof visualElementSchema>

const SYSTEM_PROMPT = `You are an OCR agent. Extract all text and visual elements from the textbook page image provided.`

const USER_PROMPT = `Extract as much text as you can see from this textbook page. Also describe any visual elements (diagrams, formulas, tables, charts, molecules, images). Do your best even if the image is imperfect.

Confidence rubric (top-level):
- 0.9–1.0: Sharp image, all text clearly readable
- 0.7–0.9: Mostly readable, minor blur or cropping
- 0.5–0.7: Partial — some words/lines unclear or missing
- 0.0–0.5: Poor quality — large portions unreadable

If no visual elements are present, return an empty array for visual_elements.`

const MIN_PAGE_CONFIDENCE = 0.5
const MIN_ELEMENT_CONFIDENCE = 0.6

export async function runOcrAgent(
  images: AgentImage[],
  apiKey: string,
  model: string,
): Promise<AgentResult<OcrOutput>> {
  const result = await runAgent({
    name: 'ocr',
    systemPrompt: SYSTEM_PROMPT,
    userContent: { textContent: USER_PROMPT, images },
    schema: ocrSchema,
    apiKey,
    model,
  })

  if (result.output.confidence < MIN_PAGE_CONFIDENCE) {
    throw new Error(`low_confidence:${result.output.confidence}`)
  }

  return {
    ...result,
    output: {
      ...result.output,
      visual_elements: result.output.visual_elements.filter(e => e.confidence >= MIN_ELEMENT_CONFIDENCE),
    },
  }
}
