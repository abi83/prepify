import type { Concept, QuestionTask } from "../../types/pipeline"
import type { GeneratedQuestion } from "../../types/questions"
import type { AgentMeta } from "../agent"
import type { Review } from "../agents/QuestionReviewer"

export function emptyMeta(): AgentMeta {
  return { model: "", tier: "", promptTokens: 0, cachedTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, toolCalls: 0, executionMs: 0 }
}

export function meta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return { ...emptyMeta(), model: "gpt-5-nano", tier: "flex", promptTokens: 100, completionTokens: 50, totalTokens: 150, costUsd: 0.0003, executionMs: 500, ...overrides }
}

export const concept: Concept = { name: "Concept", description: "x".repeat(40), importance: 0.5, misconceptions: [] }
export const task: QuestionTask = { concepts: [ concept ], type: "flashcard", difficulty: "easy" }

export function flashcard(front: string): GeneratedQuestion {
  return {
    type: "flashcard",
    content: { front, back: "A", back_explanation: "", asset_hint: { needed: false, type: null, description: null } },
  }
}

export function review(passed: boolean): Review {
  const metric = { score: passed ? 1 : 0.5, comment: "c" }
  return { scores: { correctness: metric, conceptAlignment: metric, clarity: metric, cognitiveDemand: metric, distractorQuality: null }, comment: "overall" }
}
