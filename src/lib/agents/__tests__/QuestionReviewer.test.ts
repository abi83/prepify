import { describe, it, expect } from "vitest"

import { passesReview } from "../QuestionReviewer"
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
