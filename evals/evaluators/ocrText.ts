import { z } from "zod"

import type { Prompt } from "@/lib/prompt"
import type { Evaluator } from "@evals/evaluator"

const SYSTEM_PROMPT = `You are a strict judge of OCR text accuracy. You are shown textbook page image(s) and the OCR model's extracted text and detected language. Judge only the text, against the images. Ignore visual elements and the model's own confidence.

Score from 0.0 to 1.0:
- 1.0: Text is complete and exact, including accents, symbols, formulas and punctuation; reading order is right; language is right; nothing invented.
- 0.8: Minor slips (a few characters, punctuation, small formatting); no meaning lost.
- 0.6: Noticeable errors or omissions (missing lines, wrong words, broken reading order); main content still usable.
- 0.4: Substantial text missing or garbled.
- 0.2: Mostly wrong or incomplete; little of the page is usable.
- 0.0: Unrelated to the page, empty, or fabricated.

Penalize invented text as heavily as omissions. Use intermediate values between the anchors. In "reasoning", name the specific errors you found in two to four sentences.`

const outputSchema = z.object({ text: z.string(), language: z.string() })

export const prompt: Prompt = { version: "1.0.0", text: SYSTEM_PROMPT }

export const ocrTextEvaluator: Evaluator = {
  agent: "ocr",
  metric: "text",
  prompt,
  buildJudgeInput: ({ input, output }) => {
    const { text, language } = outputSchema.parse(output)
    return {
      textContent: `OCR model instructions:\n${input.textContent}\n\nOCR model output (JSON):\n${JSON.stringify({ text, language }, null, 2)}`,
      images: input.images,
    }
  },
}
