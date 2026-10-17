import { describe, expect, it } from "vitest"

import { assertConceptsFound, nextJobs, type PlanTarget } from "@/lib/planner"
import type { PageConceptsState, PrepState } from "@/types/prepState"

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
    images: [ { id: "i1", ocrDone: true, concepts: FOUND, merge: "merged" } ],
    concepts: CONCEPTS,
    prepMetaDone: true,
    questionCount: 0,
    questionJobCount: 0,
    unfinishedJobCount: 0,
    conceptUsage: {},
    assetQuestionIds: [],
    ...overrides,
  }
}

describe("nextJobs", () => {
  it("plans one ocr job per image on an empty prep", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: false, concepts: { status: "pending" }, merge: "none" }, { id: "i2", ocrDone: false, concepts: { status: "pending" }, merge: "none" } ], concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([
      { type: "ocr", inputIds: [ "i1" ], question: null },
      { type: "ocr", inputIds: [ "i2" ], question: null },
    ])
  })

  it("only plans ocr for the images still missing it", () => {
    const specs = nextJobs(state({ images: [ { id: "i1", ocrDone: true, concepts: { status: "pending" }, merge: "none" }, { id: "i2", ocrDone: false, concepts: { status: "pending" }, merge: "none" } ], concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([ { type: "ocr", inputIds: [ "i2" ], question: null } ])
  })

  it("plans nothing for a prep with no images", () => {
    expect(nextJobs(state({ images: [], concepts: [], prepMetaDone: false }), TARGET)).toEqual([])
  })

  it("plans one concepts.extract job per image once OCR is done", () => {
    const images: PrepState["images"] = [ { id: "i1", ocrDone: true, concepts: PENDING, merge: "none" }, { id: "i2", ocrDone: true, concepts: PENDING, merge: "none" } ]
    const specs = nextJobs(state({ images, concepts: [] }), TARGET)
    expect(specs).toEqual([
      { type: "concepts.extract", inputIds: [ "i1" ], question: null },
      { type: "concepts.extract", inputIds: [ "i2" ], question: null },
    ])
  })

  it("only plans extraction for the images not yet extracted, including empty ones", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: FOUND, merge: "none" },
      { id: "i2", ocrDone: true, concepts: EMPTY, merge: "none" },
      { id: "i3", ocrDone: true, concepts: PENDING, merge: "none" },
    ]
    const specs = nextJobs(state({ images, concepts: [] }), TARGET)
    expect(specs).toEqual([ { type: "concepts.extract", inputIds: [ "i3" ], question: null } ])
  })

  it("plans the first found page's merge once all pages are extracted, skipping empty ones", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: EMPTY, merge: "none" },
      { id: "i2", ocrDone: true, concepts: FOUND, merge: "none" },
      { id: "i3", ocrDone: true, concepts: FOUND, merge: "none" },
    ]
    expect(nextJobs(state({ images, concepts: [] }), TARGET)).toEqual([ { type: "concepts", inputIds: [ "i2" ], question: null } ])
  })

  it("plans the next page's merge only after the earlier pages are merged", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: FOUND, merge: "merged" },
      { id: "i2", ocrDone: true, concepts: FOUND, merge: "none" },
      { id: "i3", ocrDone: true, concepts: FOUND, merge: "none" },
    ]
    expect(nextJobs(state({ images }), TARGET)).toEqual([ { type: "concepts", inputIds: [ "i2" ], question: null } ])
  })

  it("plans nothing while the earlier page's merge job is unfinished", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: FOUND, merge: "planned" },
      { id: "i2", ocrDone: true, concepts: FOUND, merge: "none" },
    ]
    expect(nextJobs(state({ images, concepts: [] }), TARGET)).toEqual([])
    expect(nextJobs(state({ images }), TARGET)).toEqual([])
  })

  it("merges a page added to a prep that already has concepts and questions, before assets", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: FOUND, merge: "merged" },
      { id: "i2", ocrDone: true, concepts: FOUND, merge: "none" },
    ]
    const specs = nextJobs(state({ images, questionCount: 5, questionJobCount: 5, assetQuestionIds: [ "q1" ] }), TARGET)
    expect(specs).toEqual([ { type: "concepts", inputIds: [ "i2" ], question: null } ])
  })

  it("extracts a page added to a prep that already has concepts", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: FOUND, merge: "merged" },
      { id: "i2", ocrDone: true, concepts: PENDING, merge: "none" },
    ]
    expect(nextJobs(state({ images }), TARGET)).toEqual([ { type: "concepts.extract", inputIds: [ "i2" ], question: null } ])
  })

  it("doesn't re-extract a page that was already merged", () => {
    const images: PrepState["images"] = [ { id: "i1", ocrDone: true, concepts: PENDING, merge: "merged" } ]
    expect(nextJobs(state({ images }), TARGET).every(spec => spec.type === "question")).toBe(true)
  })

  it("plans nothing when every page came up empty", () => {
    const images: PrepState["images"] = [ { id: "i1", ocrDone: true, concepts: EMPTY, merge: "none" }, { id: "i2", ocrDone: true, concepts: EMPTY, merge: "none" } ]
    expect(nextJobs(state({ images, concepts: [] }), TARGET)).toEqual([])
  })

  it("plans prep.meta over every page's OCR alongside concept extraction", () => {
    const images: PrepState["images"] = [ { id: "i1", ocrDone: true, concepts: PENDING, merge: "none" }, { id: "i2", ocrDone: true, concepts: PENDING, merge: "none" } ]
    const specs = nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)
    expect(specs).toEqual([
      { type: "concepts.extract", inputIds: [ "i1" ], question: null },
      { type: "concepts.extract", inputIds: [ "i2" ], question: null },
      { type: "prep.meta", inputIds: [ "i1", "i2" ], question: null },
    ])
  })

  it("plans prep.meta alongside question jobs when it is still missing", () => {
    const specs = nextJobs(state({ prepMetaDone: false }), TARGET)
    expect(specs.filter(spec => spec.type === "question")).toHaveLength(5)
    expect(specs.filter(spec => spec.type === "prep.meta")).toEqual([ { type: "prep.meta", inputIds: [ "i1" ], question: null } ])
  })

  it("plans prep.meta even when every page came up empty", () => {
    const images: PrepState["images"] = [ { id: "i1", ocrDone: true, concepts: EMPTY, merge: "none" } ]
    expect(nextJobs(state({ images, concepts: [], prepMetaDone: false }), TARGET)).toEqual([ { type: "prep.meta", inputIds: [ "i1" ], question: null } ])
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

  describe("additionalQuestions", () => {
    const EXISTING = { questionCount: 5, questionJobCount: 5 }

    it("plans that many new question jobs on a prep that already has questions", () => {
      const specs = nextJobs(state(EXISTING), { ...TARGET, additionalQuestions: 5 })
      expect(specs).toHaveLength(5)
      expect(specs.every(spec => spec.type === "question")).toBe(true)
    })

    it("applies the config's types to the new questions", () => {
      const specs = nextJobs(state(EXISTING), { ...TARGET, enabledTypes: [ "flashcard" ], additionalQuestions: 3 })
      expect(specs.map(spec => spec.question?.questionType)).toEqual([ "flashcard", "flashcard", "flashcard" ])
    })

    it("plans only assets while jobs are unfinished", () => {
      const specs = nextJobs(state({ ...EXISTING, unfinishedJobCount: 1, assetQuestionIds: [ "q1" ] }), { ...TARGET, additionalQuestions: 5 })
      expect(specs).toEqual([ { type: "asset", inputIds: [ "q1" ], question: null } ])
    })

    it("favours concepts the existing questions don't cover", () => {
      const skewed = state({ ...EXISTING, conceptUsage: { c1: 40 } })
      const uses = { c1: 0, other: 0 }
      for (let run = 0; run < 50; run++) {
        for (const spec of nextJobs(skewed, { ...TARGET, additionalQuestions: 5 })) {
          for (const id of spec.inputIds) uses[id === "c1" ? "c1" : "other"]++
        }
      }
      expect(uses.other).toBeGreaterThan(uses.c1 * 3)
    })
  })

  it("plans one asset job per question needing an asset once question jobs exist", () => {
    const specs = nextJobs(state({ questionCount: 3, questionJobCount: 3, assetQuestionIds: [ "q1", "q3" ] }), TARGET)
    expect(specs).toEqual([
      { type: "asset", inputIds: [ "q1" ], question: null },
      { type: "asset", inputIds: [ "q3" ], question: null },
    ])
  })
})

describe("assertConceptsFound", () => {
  it("throws, naming the distinct reasons, when every page is empty", () => {
    const images: PrepState["images"] = [
      { id: "i1", ocrDone: true, concepts: EMPTY, merge: "none" },
      { id: "i2", ocrDone: true, concepts: { status: "empty", reason: "unreadable" }, merge: "none" },
      { id: "i3", ocrDone: true, concepts: EMPTY, merge: "none" },
    ]
    expect(() => assertConceptsFound(state({ images, concepts: [] }))).toThrow("No concepts found in any page (not_educational, unreadable)")
  })

  it("passes for a prep with concepts, or with no images", () => {
    expect(() => assertConceptsFound(state())).not.toThrow()
    expect(() => assertConceptsFound(state({ images: [], concepts: [] }))).not.toThrow()
  })
})
