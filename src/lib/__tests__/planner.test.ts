import { describe, expect, it } from "vitest"

import { assertConceptsFound, nextJobs, type PageConceptsState, type PlanTarget, type PrepState } from "@/lib/planner"

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

const PENDING: PageConceptsState = { status: "pending" }
const EMPTY: PageConceptsState = { status: "empty", reason: "not_educational" }
const FOUND: PageConceptsState = { status: "found", concepts: [ concept("c1", 0.9) ] }

const CONCEPTS = [ concept("c1", 0.9), concept("c2", 0.7), concept("c3", 0.5) ]

function state(overrides: Partial<PrepState> = {}): PrepState {
  return {
    images: [ { id: "i1", ocrDone: true, concepts: { status: "pending" } } ],
    concepts: CONCEPTS,
    prepMetaDone: true,
    questionCount: 0,
    questionJobCount: 0,
    ...overrides,
  }
}

describe("nextJobs", () => {
  it("plans one ocr job per image on an empty prep", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: false, concepts: { status: "pending" } }, { id: "i2", ocrDone: false, concepts: { status: "pending" } } ], concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([
      { type: "ocr", inputIds: [ "i1" ], question: null },
      { type: "ocr", inputIds: [ "i2" ], question: null },
    ])
  })

  it("only plans ocr for the images still missing it", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: true, concepts: { status: "pending" } }, { id: "i2", ocrDone: false, concepts: { status: "pending" } } ], concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "ocr", inputIds: [ "i2" ], question: null } ])
  })

  it("plans nothing for a prep with no images", () => {
    expect(nextJobs(state({ images: [], concepts: [], prepMetaDone: false }), TARGET)).toEqual([])
  })

  it("plans one concepts.extract job per image once OCR is done", () => {
    const images = [ { id: "i1", ocrDone: true, concepts: PENDING }, { id: "i2", ocrDone: true, concepts: PENDING } ]
    const specs = nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([
      { type: "concepts.extract", inputIds: [ "i1" ], question: null },
      { type: "concepts.extract", inputIds: [ "i2" ], question: null },
    ])
  })

  it("only plans extraction for the images not yet extracted, including empty ones", () => {
    const images = [
      { id: "i1", ocrDone: true, concepts: FOUND },
      { id: "i2", ocrDone: true, concepts: EMPTY },
      { id: "i3", ocrDone: true, concepts: PENDING },
    ]
    const specs = nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "concepts.extract", inputIds: [ "i3" ], question: null } ])
  })

  it("plans the concepts merge over the images that yielded concepts once all are extracted", () => {
    const images = [
      { id: "i1", ocrDone: true, concepts: FOUND },
      { id: "i2", ocrDone: true, concepts: EMPTY },
      { id: "i3", ocrDone: true, concepts: FOUND },
    ]
    const specs = nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "concepts", inputIds: [ "i1", "i3" ], question: null } ])
  })

  it("plans nothing when every page came up empty", () => {
    const images = [ { id: "i1", ocrDone: true, concepts: EMPTY }, { id: "i2", ocrDone: true, concepts: EMPTY } ]
    expect(nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)).toEqual([])
  })

  it("skips extraction when the prep already has concepts", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: true, concepts: PENDING } ], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "prep.meta", inputIds: [ "c1", "c2", "c3" ], question: null } ])
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

  it("plans nothing once question jobs exist, even with fewer questions than the target", () => {
    expect(nextJobs(state({ questionCount: 2, questionJobCount: 5 }), { ...TARGET, questionCount: 10 })).toEqual([])
  })
})

describe("assertConceptsFound", () => {
  it("throws, naming the distinct reasons, when every page is empty", () => {
    const images = [
      { id: "i1", ocrDone: true, concepts: EMPTY },
      { id: "i2", ocrDone: true, concepts: { status: "empty", reason: "unreadable" } satisfies PageConceptsState },
      { id: "i3", ocrDone: true, concepts: EMPTY },
    ]
    expect(() => assertConceptsFound(state({ images, concepts: [] }))).toThrow("No concepts found in any page (not_educational, unreadable)")
  })

  it("passes for a prep with concepts, or with no images", () => {
    expect(() => assertConceptsFound(state())).not.toThrow()
    expect(() => assertConceptsFound(state({ images: [], concepts: [] }))).not.toThrow()
  })
})
