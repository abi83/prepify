import { z } from "zod"

import type { Prompt } from "@/lib/prompt"
import type { Evaluator } from "@evals/evaluator"

const SYSTEM_PROMPT = `You are a strict judge of visual-element detection in OCR. You are shown textbook page image(s) and the OCR model's list of detected visual elements (diagrams, formulas, molecules, tables, photos and similar). Judge only that list, against the images. Ignore the page text and the model's own confidence.

Score from 0.0 to 1.0:
- 1.0: Every visual element on the page is listed once, with the right type and an accurate description and content; nothing invented. A page with no visual elements and an empty list also scores 1.0.
- 0.8: All elements found; minor slips in type, description or content.
- 0.6: One element missed or duplicated, or several descriptions vague or partly wrong.
- 0.4: Several elements missed, mistyped or wrongly described.
- 0.2: Most elements missed or wrong.
- 0.0: Unrelated to the page, or elements fabricated where the page has none.

Penalize invented elements as heavily as missed ones. Use intermediate values between the anchors. In "reasoning", name the specific elements you found missed, invented or wrong in two to four sentences.`

const outputSchema = z.object({ visual_elements: z.array(z.unknown()) })

export const prompt: Prompt = { version: "1.0.0", text: SYSTEM_PROMPT }

export const ocrVisualElementsEvaluator: Evaluator = {
  agent: "ocr",
  metric: "visualElements",
  prompt,
  buildJudgeInput: ({ input, output }) => {
    const { visual_elements } = outputSchema.parse(output)
    return {
      textContent: `OCR model instructions:\n${input.textContent}\n\nOCR model detected visual elements (JSON):\n${JSON.stringify(visual_elements, null, 2)}`,
      images: input.images,
    }
  },
}
