import { z } from "zod"

import type { QuestionTask } from "../../types/pipeline"
import type { GeneratedQuestion, QuestionType } from "../../types/questions"
import { runAgent, AgentResult } from "../agent"

const TYPES_WITH_DISTRACTORS = new Set<QuestionType>([ "single_choice", "multiple_choice", "fill_the_gap" ])

function hasDistractors(type: QuestionType): boolean {
  return TYPES_WITH_DISTRACTORS.has(type)
}

const metricSchema = z.object({
  score: z.number().min(0).max(1),
  comment: z.string().max(120),
})

const reviewScoresSchema = z.object({
  correctness: metricSchema,
  conceptAlignment: metricSchema,
  clarity: metricSchema,
  cognitiveDemand: metricSchema,
  distractorQuality: metricSchema.nullable(),
})

export type ReviewScores = z.infer<typeof reviewScoresSchema>

const reviewSchema = z.object({
  scores: reviewScoresSchema,
  comment: z.string().max(200),
})

export type Review = z.infer<typeof reviewSchema>

/** Each metric must clear its own floor AND the average must clear AVERAGE_FLOOR — uniformly mediocre fails. */
export const METRIC_FLOOR = 0.7
export const CORRECTNESS_FLOOR = 0.9
export const AVERAGE_FLOOR = 0.85

/** distractorQuality must be null exactly for types with no distractors — a schema-unenforceable invariant. */
export function hasValidDistractorShape(type: QuestionType, scores: ReviewScores): boolean {
  return hasDistractors(type) === (scores.distractorQuality !== null)
}

interface NamedMetric {
  name: string
  score: number
  comment: string
}

function applicableMetrics(scores: ReviewScores): NamedMetric[] {
  const metrics: NamedMetric[] = [
    { name: "correctness", ...scores.correctness },
    { name: "conceptAlignment", ...scores.conceptAlignment },
    { name: "clarity", ...scores.clarity },
    { name: "cognitiveDemand", ...scores.cognitiveDemand },
  ]
  if (scores.distractorQuality !== null) metrics.push({ name: "distractorQuality", ...scores.distractorQuality })
  return metrics
}

export function passesReview(scores: ReviewScores): boolean {
  const metrics = applicableMetrics(scores)
  const belowFloor = metrics.some(m => m.score < (m.name === "correctness" ? CORRECTNESS_FLOOR : METRIC_FLOOR))
  const average = metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length
  return !belowFloor && average >= AVERAGE_FLOOR
}

/** Critique text for a builder rewrite: the global comment plus every metric's score and comment. */
export function reviewFeedback(review: Review): string {
  const lines = applicableMetrics(review.scores).map(m => `- ${m.name}: ${m.score.toFixed(2)} — ${m.comment}`)
  return `${review.comment}\n${lines.join("\n")}`
}

const SYSTEM_PROMPT_BASE = `You are an expert study question reviewer.
Score the provided study question. Do NOT rewrite or correct it — only judge it.

Metrics, each scored 0-1 with a short comment (max 120 chars):
- correctness: Are the correct answer(s) actually correct, and are the distractors actually wrong?
- conceptAlignment: Does the question actually assess the given concept(s), not something tangential?
- clarity: Is the question unambiguous and well-formed? No trailing text corruption?
- cognitiveDemand: Does it test understanding/application at the level the difficulty tier below calls for?
- distractorQuality: For question types with wrong-answer options, are those options well-constructed for the tier below? Use null for question types with no distractors.

Comments must name the concrete problem and what to change, so a writer can fix it. Keep comments on metrics scoring 0.85+ minimal.
Also give an overall comment (max 200 chars) on the most important change needed.

Return JSON: { "scores": { "correctness": {"score": <0-1>, "comment": "..."}, "conceptAlignment": {...}, "clarity": {...}, "cognitiveDemand": {...}, "distractorQuality": {...} or null }, "comment": "..." }`

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
): Promise<AgentResult<{ review: Review; passed: boolean }>> {
  const langInstruction = language !== "en" ? `\nAll comments must be in ${language}.` : ""
  const result = await runAgent({
    name: "QuestionReviewer",
    systemPrompt: `${SYSTEM_PROMPT_BASE}\n\n${difficultyRubric(task)}${langInstruction}`,
    userContent: { textContent: `${formatConcepts(task)}\n\nQuestion to review:\n${JSON.stringify(question, null, 2)}` },
    schema: reviewSchema.refine(
      review => hasValidDistractorShape(task.type, review.scores),
      { message: `distractorQuality must be ${hasDistractors(task.type) ? "a number" : "null"} for type "${task.type}"` },
    ),
    apiKey,
    model,
    signal,
  })
  return { output: { review: result.output, passed: passesReview(result.output.scores) }, meta: result.meta }
}
