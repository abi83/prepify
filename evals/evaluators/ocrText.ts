import { z } from "zod"

import type { Prompt } from "@/lib/prompt"
import type { Evaluator } from "@evals/evaluator"

const SYSTEM_PROMPT = `You are a strict judge of OCR text accuracy. You are shown textbook page image(s) and the OCR model's extracted text and detected language. Judge only the text, against the images. Ignore visual elements and the model's own confidence.

What counts as text: body text, headings, exercises, footnotes, page numbers and running headers. Figure captions and labels inside photos or diagrams are not text omissions; a separate judge covers them. Text the OCR inserted that is not on the page (for example a placeholder like "[Diagramm: ...]") is a minor invention.

Method:
1. Compare the OCR text with the page section by section.
2. List each error you find. For every error, quote the printed text and the OCR text side by side. If you cannot quote the printed text from the image, it is not an error.
3. If a character, exponent or word is too small, blurred or faded to read with confidence, do not count it as an error.
4. Score from the errors you listed, not from an overall impression.

Score from 0.0 to 1.0:
- 1.0: you checked and found no errors.
- 0.9: one to three minor slips (a character, accent, punctuation); no meaning lost.
- 0.7: several slips, or one missing or garbled line; main content intact.
- 0.5: a missing or garbled paragraph, or many wrong words or symbols; the page is still usable.
- 0.3: most of the page missing or garbled.
- 0.1: only a fragment of the page captured.
- 0.0: unrelated to the page, empty, or fabricated.

Use intermediate values between the anchors. Penalize invented text as heavily as omissions. In "reasoning", give the quoted errors (printed -> OCR), or state that none were found.`

const outputSchema = z.object({ text: z.string(), language: z.string() })

export const prompt: Prompt = { version: "1.1.0", text: SYSTEM_PROMPT }

// Judge model: gpt-6.1-sol, chosen by validating against hand-reviewed verdicts (within 0.15 on 15 of 18; gpt-5.4-mini 8 of 18).
// Re-validate before changing the model or the rubric.
export const ocrTextEvaluator: Evaluator = {
  agent: "ocr",
  metric: "text",
  llm: { model: "gpt-6.1-sol", tier: "flex" },
  prompt,
  buildJudgeInput: ({ input, output }) => {
    const { text, language } = outputSchema.parse(output)
    return {
      textContent: `OCR model instructions:\n${input.textContent}\n\nOCR model output (JSON):\n${JSON.stringify({ text, language }, null, 2)}`,
      images: input.images,
    }
  },
}
