import { describe, expect, it } from "vitest"

import { sortingContentSchema } from "@/types/questions"

function sortingContent(correctIndexes: number[]) {
  return {
    question: "Order these",
    answers: correctIndexes.map((correct_index, i) => ({
      id: String(i), text: `Item ${i}`, correct_index, explanation: "because",
    })),
    rationale: "r",
    asset_hint: { needed: false, type: null, description: null },
  }
}

describe("sortingContentSchema", () => {
  it("accepts a real permutation of 1-4", () => {
    expect(sortingContentSchema.safeParse(sortingContent([ 3, 1, 4, 2 ])).success).toBe(true)
  })

  it("rejects non-integer correct_index values even when the four are distinct", () => {
    // Distinct but non-integer — not a permutation of {1,2,3,4} despite passing a set-size check
    const result = sortingContentSchema.safeParse(sortingContent([ 1, 1.5, 2, 3 ]))
    expect(result.success).toBe(false)
  })

  it("rejects a repeated correct_index", () => {
    const result = sortingContentSchema.safeParse(sortingContent([ 1, 1, 2, 3 ]))
    expect(result.success).toBe(false)
  })
})
