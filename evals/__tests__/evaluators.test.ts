import { describe, expect, it } from "vitest"

import { getEvaluator } from "@evals/evaluators"
import { prepMetaEvaluator } from "@evals/evaluators/prepMeta"

import { makeSample } from "./fixtures"

describe("prepMetaEvaluator", () => {
  it("is registered under the agent name", () => {
    expect(getEvaluator("PrepMeta")).toBe(prepMetaEvaluator)
  })

  it("shows the judge the source text and the output", () => {
    const sample = makeSample(1, {
      agent: "PrepMeta",
      input: { textContent: "Source text:\n\n=== Page 1 ===\nMitosis", images: [] },
      output: { title: "Mitosis", description: "d", grade: 9, discipline: "Biology" },
    })
    const { textContent } = prepMetaEvaluator.buildJudgeInput(sample)
    expect(textContent).toContain("=== Page 1 ===\nMitosis")
    expect(textContent).toContain("\"discipline\": \"Biology\"")
  })
})
