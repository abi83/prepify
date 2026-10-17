import { describe, expect, it } from "vitest"

import { DIFFICULTIES, isDifficulty } from "@/lib/difficulty"

describe("isDifficulty", () => {
  it.each(DIFFICULTIES)("accepts %s", value => {
    expect(isDifficulty(value)).toBe(true)
  })

  it.each([ "", "Easy", "extreme" ])("rejects %j", value => {
    expect(isDifficulty(value)).toBe(false)
  })
})
