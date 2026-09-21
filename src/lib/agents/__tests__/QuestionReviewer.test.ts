import { describe, it, expect } from "vitest"

import { assertDistractorQualityShape, passesReview } from "../QuestionReviewer"
import type { ReviewScores } from "../QuestionReviewer"

function scores(overrides: Partial<ReviewScores> = {}): ReviewScores {
  return {
    correctness: 1,
    conceptAlignment: 1,
    clarity: 1,
    cognitiveDemand: 1,
    distractorQuality: 1,
    ...overrides,
  }
}

describe("passesReview", () => {
  it("passes when every applicable metric is at or above threshold", () => {
    expect(passesReview(scores({ correctness: 0.9, conceptAlignment: 0.8, clarity: 0.8, cognitiveDemand: 0.8, distractorQuality: 0.8 }))).toBe(true)
  })

  it("fails on a high average if correctness is below the floor", () => {
    expect(passesReview(scores({ correctness: 0.7, conceptAlignment: 1, clarity: 1, cognitiveDemand: 1, distractorQuality: 1 }))).toBe(false)
  })

  it("fails when correctness is high but the average is below the pass threshold", () => {
    expect(passesReview(scores({ correctness: 1, conceptAlignment: 0.3, clarity: 0.3, cognitiveDemand: 0.3, distractorQuality: 0.3 }))).toBe(false)
  })

  it("excludes a null distractorQuality from the average instead of counting it as 0", () => {
    const withNullDistractor = scores({ correctness: 0.9, conceptAlignment: 0.8, clarity: 0.8, cognitiveDemand: 0.8, distractorQuality: null })
    expect(passesReview(withNullDistractor)).toBe(true)
  })
})

describe("assertDistractorQualityShape", () => {
  it("accepts a number for a choice-based type", () => {
    expect(() => assertDistractorQualityShape("single_choice", scores({ distractorQuality: 0.7 }))).not.toThrow()
  })

  it("accepts null for a type with no distractors", () => {
    expect(() => assertDistractorQualityShape("flashcard", scores({ distractorQuality: null }))).not.toThrow()
  })

  it("throws when a choice-based type gets a null distractorQuality", () => {
    expect(() => assertDistractorQualityShape("multiple_choice", scores({ distractorQuality: null }))).toThrow()
  })

  it("throws when a type with no distractors gets a numeric distractorQuality", () => {
    expect(() => assertDistractorQualityShape("sorting", scores({ distractorQuality: 0.5 }))).toThrow()
  })
})
