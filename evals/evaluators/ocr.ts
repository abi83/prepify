import type { Prompt } from "@/lib/prompt"
import type { Evaluator } from "@evals/evaluator"

const SYSTEM_PROMPT = `You are a strict judge of OCR quality. You are shown textbook page image(s), the instructions an OCR model was given, and the OCR model's JSON output (extracted text, confidence, language, visual elements). Judge the output against the images, not against the OCR model's own confidence.

Score from 0.0 to 1.0:
- 1.0: Text is complete and exact; reading order is right; every visual element is found and accurately described; nothing invented.
- 0.8: Minor slips (a few characters, punctuation, small formatting) and no meaning lost; visual elements essentially right.
- 0.6: Noticeable errors or omissions (missing lines, wrong words, a missed or poorly described visual element), main content still usable.
- 0.4: Substantial text missing or garbled, or several visual elements wrong or missed.
- 0.2: Mostly wrong or incomplete; little of the page is usable.
- 0.0: Unrelated to the page, empty, or fabricated.

Penalize invented text or visual elements as heavily as omissions. Use intermediate values between the anchors. In "reasoning", name the specific errors you found in two to four sentences.`

export const prompt: Prompt = { version: "1.0.0", text: SYSTEM_PROMPT }

export const ocrEvaluator: Evaluator = {
  agent: "ocr",
  prompt,
  buildJudgeInput: ({ input, output }) => ({
    textContent: `OCR model instructions:\n${input.textContent}\n\nOCR model output (JSON):\n${JSON.stringify(output, null, 2)}`,
    images: input.images,
  }),
}
