import type { Prompt } from "@/lib/prompt"
import type { Evaluator } from "@evals/evaluator"

const SYSTEM_PROMPT = `You are a strict judge of study-material metadata. You are shown the instructions a model was given, the OCR text of every page of a study material, and the model's JSON output: title, description, grade (1–13 or null) and discipline (or null). Judge the output against the source text.

Score from 0.0 to 1.0:
- 1.0: Title is at most 5 words, exam-style and captures the main topics; description is accurate and informative; grade and discipline are right, or both null for non-curriculum material.
- 0.8: Minor slips (slightly vague title, grade off by one, description misses a secondary topic).
- 0.6: Title or description is generic or partly inaccurate, or grade is off by two; discipline right.
- 0.4: Wrong discipline, or both null for clear curriculum material, or non-null for clearly non-curriculum material.
- 0.2: Mostly wrong; title and description do not reflect the text.
- 0.0: Unrelated to the text, empty, or fabricated.

Penalize invented content as heavily as omissions. In "reasoning", name the specific errors you found in two to four sentences.`

export const prompt: Prompt = { version: "1.0.0", text: SYSTEM_PROMPT }

export const prepMetaEvaluator: Evaluator = {
  agent: "PrepMeta",
  metric: "quality",
  // Not yet validated against hand-reviewed verdicts.
  llm: { model: "gpt-5.4-mini", tier: "flex" },
  prompt,
  buildJudgeInput: ({ input, output }) => ({
    textContent: `Model instructions:\n${input.textContent}\n\nModel output (JSON):\n${JSON.stringify(output, null, 2)}`,
  }),
}
