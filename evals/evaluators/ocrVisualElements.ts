import { z } from "zod"

import type { Prompt } from "@/lib/prompt"
import type { Evaluator } from "@evals/evaluator"

const SYSTEM_PROMPT = `You are a strict judge of visual-element detection in OCR. You are shown textbook page image(s) and the OCR model's list of detected visual elements. Judge only that list, against the images. Ignore the page text and the model's own confidence.

A visual element is a self-contained figure: a photo, illustration, diagram, chart, table, map, or a boxed or displayed formula. These are not visual elements: running exercise or body text, headings, page icons and decoration, and the small labels and numbers that belong to a figure.

Method:
1. First list the visual elements you see on the page yourself.
2. Match the model's list against yours. Mark each model element as matched, spurious (nothing like it on the page) or duplicate, and each of yours the model lacks as missing.
3. Call an element spurious only if its region is clearly legible and shows something else. If the region is faded, blurred or hard to read, give the model the benefit of the doubt.
4. A collage may be listed as one element or as separate elements; both are fine if all its content is covered. A wrong type (for example "image" for a diagram) is a minor slip. Descriptions must match what is shown.
5. Score from the counts, not from an overall impression.

Score from 0.0 to 1.0:
- 1.0: every element matched with accurate descriptions; nothing spurious, duplicated or missing. A page with no visual elements and an empty list also scores 1.0.
- 0.8: all matched; minor slips in type, description or content.
- 0.6: one missing, spurious or duplicate element, or several descriptions partly wrong.
- 0.4: two or three missing, spurious or duplicate elements.
- 0.2: most elements missing or wrong.
- 0.0: unrelated to the page, or elements fabricated where the page has none.

Use intermediate values between the anchors. In "reasoning", start with your own list of elements, then the matches, and name each missing, spurious or duplicate element.`

const outputSchema = z.object({ visual_elements: z.array(z.unknown()) })

export const prompt: Prompt = { version: "1.1.0", text: SYSTEM_PROMPT }

// Judge model: gpt-6.1-sol, chosen by validating against hand-reviewed verdicts (within 0.15 on 15 of 18; gpt-5.4-mini 8 of 18).
// Re-validate before changing the model or the rubric.
export const ocrVisualElementsEvaluator: Evaluator = {
  agent: "ocr",
  metric: "visualElements",
  llm: { model: "gpt-6.1-sol", tier: "flex" },
  prompt,
  buildJudgeInput: ({ input, output }) => {
    const { visual_elements } = outputSchema.parse(output)
    return {
      textContent: `OCR model instructions:\n${input.textContent}\n\nOCR model detected visual elements (JSON):\n${JSON.stringify(visual_elements, null, 2)}`,
      images: input.images,
    }
  },
}
