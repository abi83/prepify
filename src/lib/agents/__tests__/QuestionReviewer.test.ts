import { describe, it, expect } from "vitest"

import { hasValidDistractorShape, passesReview, reviewFeedback } from "@/lib/agents/QuestionReviewer"
import type { Review, ReviewScores } from "@/lib/agents/QuestionReviewer"

function scores(values: Partial<Record<keyof ReviewScores, number | null>> = {}): ReviewScores {
  const value = (key: keyof ReviewScores) => {
    const v = key in values ? values[key] : 1
    return v === null ? null : { score: v as number, comment: `${key} comment` }
  }
  return {
    correctness: value("correctness")!,
    conceptAlignment: value("conceptAlignment")!,
    clarity: value("clarity")!,
    cognitiveDemand: value("cognitiveDemand")!,
    distractorQuality: value("distractorQuality"),
  }
}

describe("passesReview", () => {
  it("passes when every metric clears its floor and the average clears the average floor", () => {
    expect(passesReview(scores({ correctness: 0.95, conceptAlignment: 0.85, clarity: 0.85, cognitiveDemand: 0.85, distractorQuality: 0.85 }))).toBe(true)
  })

  it("fails when correctness is below its floor despite a high average", () => {
    expect(passesReview(scores({ correctness: 0.8 }))).toBe(false)
  })

  it("fails when any other metric is below its floor despite a high average", () => {
    expect(passesReview(scores({ clarity: 0.6 }))).toBe(false)
  })

  it("fails when every floor is met but the average is below the average floor", () => {
    expect(passesReview(scores({ correctness: 0.9, conceptAlignment: 0.8, clarity: 0.8, cognitiveDemand: 0.8, distractorQuality: 0.8 }))).toBe(false)
  })

  it("excludes a null distractorQuality from the average instead of counting it as 0", () => {
    expect(passesReview(scores({ distractorQuality: null }))).toBe(true)
  })
})

describe("hasValidDistractorShape", () => {
  it("accepts a score for a choice-based type", () => {
    expect(hasValidDistractorShape("single_choice", scores())).toBe(true)
  })

  it("accepts null for a type with no distractors", () => {
    expect(hasValidDistractorShape("flashcard", scores({ distractorQuality: null }))).toBe(true)
  })

  it("rejects null for a choice-based type", () => {
    expect(hasValidDistractorShape("multiple_choice", scores({ distractorQuality: null }))).toBe(false)
  })

  it("rejects a score for a type with no distractors", () => {
    expect(hasValidDistractorShape("sorting", scores())).toBe(false)
  })
})

describe("reviewFeedback", () => {
  it("lists the global comment and each applicable metric, skipping a null distractorQuality", () => {
    const review: Review = { scores: scores({ clarity: 0.5, distractorQuality: null }), comment: "Tighten the stem." }
    const feedback = reviewFeedback(review)
    expect(feedback).toContain("Tighten the stem.")
    expect(feedback).toContain("clarity: 0.50 — clarity comment")
    expect(feedback).not.toContain("distractorQuality")
  })
})
