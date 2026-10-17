import { describe, expect, it } from "vitest"

import { DEFAULT_GEN_CONFIG, MAX_FLASHCARDS, parseGenerationConfig } from "@/core/lib/generationConfig"

const parse = (value: unknown) => parseGenerationConfig(JSON.stringify(value))

describe("parseGenerationConfig", () => {
  it("returns defaults for null, empty, or malformed input", () => {
    expect(parseGenerationConfig(null)).toEqual(DEFAULT_GEN_CONFIG)
    expect(parseGenerationConfig("")).toEqual(DEFAULT_GEN_CONFIG)
    expect(parseGenerationConfig("not json")).toEqual(DEFAULT_GEN_CONFIG)
  })

  it("clamps counts", () => {
    const low = parse({ questionCount: 1, flashcardCount: -3 })
    expect(low.questionCount).toBe(5)
    expect(low.flashcardCount).toBe(0)
    const high = parse({ questionCount: 99, flashcardCount: 999 })
    expect(high.questionCount).toBe(20)
    expect(high.flashcardCount).toBe(MAX_FLASHCARDS)
  })

  it("filters unknown types and falls back when none remain", () => {
    expect(parse({ questionCount: 10, enabledTypes: [ "sorting", "bogus" ] }).enabledTypes).toEqual([ "sorting" ])
    expect(parse({ questionCount: 10, enabledTypes: [ "bogus" ] }).enabledTypes).toEqual(DEFAULT_GEN_CONFIG.enabledTypes)
  })

  it("rejects an invalid difficulty mix", () => {
    const config = parse({ questionCount: 10, difficultyMix: { easy: 0, medium: 0, hard: 0 } })
    expect(config.difficultyMix).toEqual(DEFAULT_GEN_CONFIG.difficultyMix)
  })
})
