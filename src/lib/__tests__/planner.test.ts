import { describe, expect, it } from "vitest"

import { nextJobs, type PlanTarget, type PrepState } from "@/lib/planner"

const TARGET: PlanTarget = {
  questionCount: 5,
  enabledTypes: [ "flashcard", "single_choice" ],
  difficultyMix: { easy: 1, medium: 1, hard: 1 },
}

const concept = (id: string, importance: number) => ({
  id,
  name: `Concept ${id}`,
  description: "A description that is long enough to be a realistic concept",
  importance,
  misconceptions: [],
  language: "en" as const,
})

const CONCEPTS = [ concept("c1", 0.9), concept("c2", 0.7), concept("c3", 0.5) ]

function state(overrides: Partial<PrepState> = {}): PrepState {
  return {
    images: [ { id: "i1", ocrDone: true } ],
    concepts: CONCEPTS,
    prepMetaDone: true,
    questionCount: 0,
    ...overrides,
  }
}

describe("nextJobs", () => {
  it("plans one ocr job per image on an empty prep", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: false }, { id: "i2", ocrDone: false } ], concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([
      { type: "ocr", inputIds: [ "i1" ], question: null },
      { type: "ocr", inputIds: [ "i2" ], question: null },
    ])
  })

  it("only plans ocr for the images still missing it", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: true }, { id: "i2", ocrDone: false } ], concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "ocr", inputIds: [ "i2" ], question: null } ])
  })

  it("plans nothing for a prep with no images", () => {
    expect(nextJobs(state({ images: [], concepts: [], prepMetaDone: false }), TARGET)).toEqual([])
  })

  it("plans one concepts job over all images once OCR is done", () => {
    const images = [ { id: "i1", ocrDone: true }, { id: "i2", ocrDone: true } ]
    const specs = nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "concepts", inputIds: [ "i1", "i2" ], question: null } ])
  })

  it("plans prep.meta over all concepts once concepts are done", () => {
    const specs = nextJobs(state({ prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "prep.meta", inputIds: [ "c1", "c2", "c3" ], question: null } ])
  })

  it("plans one question job per missing question, carrying type and difficulty", () => {
    const specs = nextJobs(state(), TARGET)
    expect(specs).toHaveLength(5)
    for (const spec of specs) {
      expect(spec.type).toBe("question")
      expect(spec.inputIds.length).toBeGreaterThan(0)
      expect(spec.inputIds.every(id => CONCEPTS.some(c => c.id === id))).toBe(true)
      expect(spec.question).toEqual({ questionType: expect.stringMatching(/^(flashcard|single_choice)$/), difficulty: expect.stringMatching(/^(easy|medium|hard)$/) })
    }
  })

  it("plans only the 5 more questions on a prep that already has questions", () => {
    const specs = nextJobs(state({ questionCount: 10 }), { ...TARGET, questionCount: 15 })
    expect(specs).toHaveLength(5)
  })

  it("plans nothing once the target is met", () => {
    expect(nextJobs(state({ questionCount: 5 }), TARGET)).toEqual([])
  })
})
