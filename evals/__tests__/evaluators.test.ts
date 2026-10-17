import { describe, expect, it } from "vitest"

import { getEvaluator } from "@evals/evaluators"
import { ocrTextEvaluator } from "@evals/evaluators/ocrText"
import { ocrVisualElementsEvaluator } from "@evals/evaluators/ocrVisualElements"
import { prepMetaEvaluator } from "@evals/evaluators/prepMeta"

import { makeSample } from "./fixtures"

describe("prepMetaEvaluator", () => {
  it("is registered under agent and metric", () => {
    expect(getEvaluator("PrepMeta", "quality")).toBe(prepMetaEvaluator)
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

describe("OCR evaluators", () => {
  const sample = makeSample(1, {
    output: { title: "t", text: "Bonjour le monde", confidence: 0.9, language: "fr", visual_elements: [ { type: "diagram", description: "a cell", content: "c", caption: null, context: null, confidence: 0.8 } ] },
  })

  it("are registered per metric", () => {
    expect(getEvaluator("ocr", "text")).toBe(ocrTextEvaluator)
    expect(getEvaluator("ocr", "visualElements")).toBe(ocrVisualElementsEvaluator)
    expect(() => getEvaluator("ocr", "nope")).toThrow(/Known: ocr\/text, ocr\/visualElements/)
  })

  it("show each judge only its own slice of the output, plus the images", () => {
    const text = ocrTextEvaluator.buildJudgeInput(sample)
    expect(text.textContent).toContain("Bonjour le monde")
    expect(text.textContent).toContain("\"language\": \"fr\"")
    expect(text.textContent).not.toContain("a cell")
    expect(text.images).toEqual(sample.input.images)

    const visual = ocrVisualElementsEvaluator.buildJudgeInput(sample)
    expect(visual.textContent).toContain("a cell")
    expect(visual.textContent).not.toContain("Bonjour le monde")
    expect(visual.images).toEqual(sample.input.images)
  })

  it("fail fast on output missing the judged field", () => {
    const broken = makeSample(2, { output: { title: "t" } })
    expect(() => ocrTextEvaluator.buildJudgeInput(broken)).toThrow()
    expect(() => ocrVisualElementsEvaluator.buildJudgeInput(broken)).toThrow()
  })
})
