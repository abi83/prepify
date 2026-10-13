import { describe, expect, it } from "vitest"

import { toSchemaName } from "@/lib/llm/openAiLlm"

describe("toSchemaName", () => {
  it("replaces characters OpenAI rejects", () => {
    expect(toSchemaName("eval:ocr")).toBe("eval_ocr")
  })

  it("keeps valid names unchanged", () => {
    expect(toSchemaName("QuestionReviewer-1_a")).toBe("QuestionReviewer-1_a")
  })

  it("throws on empty or over-long names", () => {
    expect(() => toSchemaName("")).toThrow()
    expect(() => toSchemaName("a".repeat(65))).toThrow()
  })
})
