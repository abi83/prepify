import { z } from "zod"

import type { QuestionTask } from "../../types/pipeline"
import { generatedQuestionSchema } from "../../types/questions"
import type { GeneratedQuestion, QuestionType } from "../../types/questions"
import { runAgent, AgentResult } from "../agent"

const TYPES_WITH_DISTRACTORS = new Set<QuestionType>([ "single_choice", "multiple_choice", "fill_the_gap" ])

function hasDistractors(type: QuestionType): boolean {
  return TYPES_WITH_DISTRACTORS.has(type)
}

const reviewScoresSchema = z.object({
  correctness: z.number().min(0).max(1),
  conceptAlignment: z.number().min(0).max(1),
  clarity: z.number().min(0).max(1),
  cognitiveDemand: z.number().min(0).max(1),
  distractorQuality: z.number().min(0).max(1).nullable(),
})

export type ReviewScores = z.infer<typeof reviewScoresSchema>

const reviewerResponseSchema = z.object({
  question: generatedQuestionSchema,
  scores: reviewScoresSchema,
})

export const PASS_THRESHOLD = 0.8
export const CORRECTNESS_FLOOR = 0.9

/** Throws if distractorQuality's nullness doesn't match the question type — a schema-unenforceable invariant. */
export function assertDistractorQualityShape(type: QuestionType, scores: ReviewScores): void {
  const expectsScore = hasDistractors(type)
  const gotScore = scores.distractorQuality !== null
  if (expectsScore !== gotScore) {
    throw new Error(`QuestionReviewer: distractorQuality must be ${expectsScore ? "a number" : "null"} for type "${type}", got ${scores.distractorQuality}`)
  }
}

export function passesReview(scores: ReviewScores): boolean {
  const applicable = [
    scores.correctness,
    scores.conceptAlignment,
    scores.clarity,
    scores.cognitiveDemand,
    ...(scores.distractorQuality === null ? [] : [ scores.distractorQuality ]),
  ]
  const average = applicable.reduce((a, b) => a + b, 0) / applicable.length
  return scores.correctness >= CORRECTNESS_FLOOR && average >= PASS_THRESHOLD
}

const SYSTEM_PROMPT_BASE = `You are an expert study question reviewer.
Review the provided study question, fix any issues you find (clarity, correctness, format), and score it:

- correctness: Are the correct answer(s) actually correct, and are the distractors actually wrong?
- conceptAlignment: Does the question actually assess the given concept(s), not something tangential?
- clarity: Is the question unambiguous and well-formed? No trailing text corruption?
- cognitiveDemand: Does it test understanding/application at the level the difficulty tier below calls for?
- distractorQuality: For question types with wrong-answer options, are those options well-constructed for the tier below? Use null for question types with no distractors.

Format integrity (fix these, they are not part of the score):
- fill_the_gap: {{gap:N}} markers must match the gaps array exactly
- sorting: correct_index must be a permutation of {1,2,3,4}
- single_choice: exactly one is_correct=true with 4 answers
- multiple_choice: 2-4 correct, 2-3 incorrect, 4-6 total

Score the corrected question you are returning, not the original submission — if you fixed an error, the scores must reflect the fixed version.

Return the corrected question in the same JSON structure, along with all five scores on a 0-1 scale.

Return JSON: { "question": <corrected question object>, "scores": { "correctness": <0-1>, "conceptAlignment": <0-1>, "clarity": <0-1>, "cognitiveDemand": <0-1>, "distractorQuality": <0-1 or null> } }`

function difficultyRubric(task: QuestionTask): string {
  const withDistractors = hasDistractors(task.type)

  if (task.difficulty === "easy") {
    return "Difficulty tier: easy (recall).\n" +
      "- cognitiveDemand: score high for a single recall step — do not penalize simplicity." +
      (withDistractors ? "\n- distractorQuality: score high when distractors are clearly, unambiguously wrong." : "")
  }

  if (task.difficulty === "medium") {
    return "Difficulty tier: medium (2-step reasoning).\n" +
      "- cognitiveDemand: expect two linear reasoning steps (interpret the situation, then apply the concept)." +
      (withDistractors ? "\n- distractorQuality: expect plausible distractors that fail a stated constraint or misapply the concept." : "")
  }

  return "Difficulty tier: hard (tricky, with traps).\n" +
    "- cognitiveDemand: expect multi-step synthesis (interpret, apply, weigh trade-offs, decide)." +
    (withDistractors ? "\n- distractorQuality: expect near-miss distractors built from misconceptions, each failing a subtle condition." : "")
}

function formatConcepts(task: QuestionTask): string {
  const concepts = task.concepts
  if (concepts.length === 1) {
    const c = concepts[0]
    return `Concept being assessed:\nName: ${c.name}\nDescription: ${c.description}`
  }
  return "Concepts being assessed:\n" +
    concepts.map((c, i) => `Concept ${i + 1}: ${c.name}\nDescription: ${c.description}`).join("\n\n")
}

export async function runQuestionReviewer(
  question: GeneratedQuestion,
  task: QuestionTask,
  apiKey: string,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ question: GeneratedQuestion; scores: ReviewScores; passed: boolean }>> {
  const langInstruction = language !== "en" ? `\nAll question text must be in ${language}.` : ""
  const result = await runAgent({
    name: "QuestionReviewer",
    systemPrompt: `${SYSTEM_PROMPT_BASE}\n\n${difficultyRubric(task)}${langInstruction}`,
    userContent: { textContent: `${formatConcepts(task)}\n\nQuestion to review:\n${JSON.stringify(question, null, 2)}` },
    schema: reviewerResponseSchema,
    apiKey,
    model,
    signal,
  }) as AgentResult<{ question: GeneratedQuestion; scores: ReviewScores }>
  assertDistractorQualityShape(task.type, result.output.scores)
  return { output: { ...result.output, passed: passesReview(result.output.scores) }, meta: result.meta }
}
