import { beforeEach, describe, expect, it, vi } from "vitest"

const recordGenerationMeta = vi.fn().mockResolvedValue(undefined)
vi.mock("../../actions/generationMeta", () => ({
  recordGenerationMeta: (...args: unknown[]) => recordGenerationMeta(...args),
}))

const saveQuestionSlot = vi.fn().mockResolvedValue(undefined)
const loadOrCreateRun = vi.fn()

vi.mock("../../actions/pipeline", () => ({
  loadOrCreateRun: (...args: unknown[]) => loadOrCreateRun(...args),
  saveConcepts: vi.fn().mockResolvedValue(undefined),
  saveQuestionTasksAndInitSlots: vi.fn().mockResolvedValue(undefined),
  saveQuestionSlot: (...args: unknown[]) => saveQuestionSlot(...args),
}))

vi.mock("../../actions/preps", () => ({
  incrementPrepTokens: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../agents/ConceptExtractor", () => ({ runConceptExtractor: vi.fn() }))
vi.mock("../agents/ConceptMerger", () => ({ runConceptMerger: vi.fn() }))

vi.mock("../agents/PrepNamer", () => ({
  runPrepNamer: vi.fn().mockResolvedValue({
    output: { title: "Title", description: "Description" },
    meta: emptyMeta(),
  }),
}))

const buildFlashcard = vi.fn()
vi.mock("../agents/builders/FlashcardBuilder", () => ({ runFlashcardBuilder: (...args: unknown[]) => buildFlashcard(...args) }))
vi.mock("../agents/builders/SingleChoiceBuilder", () => ({ runSingleChoiceBuilder: vi.fn() }))
vi.mock("../agents/builders/MultipleChoiceBuilder", () => ({ runMultipleChoiceBuilder: vi.fn() }))
vi.mock("../agents/builders/FillTheGapBuilder", () => ({ runFillTheGapBuilder: vi.fn() }))
vi.mock("../agents/builders/SortingBuilder", () => ({ runSortingBuilder: vi.fn() }))

const reviewQuestion = vi.fn()
vi.mock("../agents/QuestionReviewer", async importOriginal => ({
  ...await importOriginal<typeof import("../agents/QuestionReviewer")>(),
  runQuestionReviewer: (...args: unknown[]) => reviewQuestion(...args),
}))

import type { Concept, QuestionTask } from "../../types/pipeline"
import type { GeneratedQuestion } from "../../types/questions"
import type { AgentMeta } from "../agent"
import { runPipeline } from "../pipeline"

function emptyMeta(): AgentMeta {
  return { model: "", tier: "", promptTokens: 0, cachedTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, toolCalls: 0, executionMs: 0 }
}

function meta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return { ...emptyMeta(), model: "gpt-5-nano", tier: "flex", promptTokens: 100, completionTokens: 50, totalTokens: 150, costUsd: 0.0003, executionMs: 500, ...overrides }
}

const concept: Concept = { name: "Concept", description: "x".repeat(40), importance: 0.5, misconceptions: [] }
const task: QuestionTask = { concepts: [ concept ], type: "flashcard", difficulty: "easy" }

function flashcard(front: string): GeneratedQuestion {
  return {
    type: "flashcard",
    content: { front, back: "A", back_explanation: "", asset_hint: { needed: false, type: null, description: null } },
  }
}

function review(passed: boolean) {
  const metric = { score: passed ? 1 : 0.5, comment: "c" }
  return {
    review: { scores: { correctness: metric, conceptAlignment: metric, clarity: metric, cognitiveDemand: metric, distractorQuality: null }, comment: "overall" },
    passed,
  }
}

function singleSlotRun() {
  loadOrCreateRun.mockResolvedValue({
    runId: "run-1",
    concepts: [ concept ],
    questionTasks: [ task ],
    questionSlots: new Map([ [ 0, null ] ]),
    slotMeta: new Map([ [ 0, [] ] ]),
  })
}

function run() {
  return runPipeline({ prepId: "prep-1", pages: [], apiKey: "key", model: "model", onProgress: vi.fn() })
}

beforeEach(() => {
  vi.clearAllMocks()
  buildFlashcard.mockReset()
  reviewQuestion.mockReset()
})

describe("runPipeline resume", () => {
  it("keeps a resumed slot's persisted meta at its original array position, alongside newly built meta", async () => {
    const resumedQuestion = flashcard("resumed")
    const resumedMeta = meta({ model: "resumed-model" })
    const builtMeta = meta({ model: "build-model" })
    const reviewMeta = meta({ model: "review-model" })

    loadOrCreateRun.mockResolvedValue({
      runId: "run-1",
      concepts: [ concept ],
      questionTasks: [ task, task ],
      questionSlots: new Map([ [ 0, resumedQuestion ], [ 1, null ] ]),
      slotMeta: new Map([ [ 0, [ resumedMeta ] ], [ 1, [] ] ]),
    })

    const builtQuestion = flashcard("built")
    buildFlashcard.mockResolvedValue({ output: builtQuestion, meta: builtMeta })
    reviewQuestion.mockResolvedValue({
      output: review(true),
      meta: reviewMeta,
    })

    const result = await runPipeline({
      prepId: "prep-1",
      pages: [],
      apiKey: "key",
      model: "model",
      onProgress: vi.fn(),
    })

    expect(result.questions).toEqual([ { ...resumedQuestion, difficulty: "easy" }, { ...builtQuestion, difficulty: "easy" } ])
    expect(result.questionMeta).toEqual([
      [ resumedMeta ],
      [ builtMeta, reviewMeta ],
    ])
    expect(saveQuestionSlot).toHaveBeenCalledWith("run-1", 1, builtQuestion, [ builtMeta, reviewMeta ])
  })
})

describe("runPipeline reviewer rejection", () => {
  const buildMeta1 = meta({ model: "build-1" })
  const reviewMeta1 = meta({ model: "review-1" })
  const buildMeta2 = meta({ model: "build-2" })
  const reviewMeta2 = meta({ model: "review-2" })
  const first = flashcard("first")
  const second = flashcard("second")

  beforeEach(() => {
    singleSlotRun()
    buildFlashcard
      .mockResolvedValueOnce({ output: first, meta: buildMeta1 })
      .mockResolvedValueOnce({ output: second, meta: buildMeta2 })
  })

  it("rewrites with the reviewer's feedback and reviews the rewrite independently; ships a passing rewrite", async () => {
    reviewQuestion
      .mockResolvedValueOnce({ output: review(false), meta: reviewMeta1 })
      .mockResolvedValueOnce({ output: review(true), meta: reviewMeta2 })

    const result = await run()

    expect(buildFlashcard.mock.calls[1][5]).toEqual({ question: first, feedback: expect.stringContaining("overall") })
    expect(reviewQuestion).toHaveBeenCalledTimes(2)
    expect(reviewQuestion.mock.calls[1][0]).toBe(second)
    expect(reviewQuestion.mock.calls[1]).toHaveLength(6) // no prior-review context passed
    expect(result.questions).toEqual([ { ...second, difficulty: "easy" } ])
    expect(result.questionMeta).toEqual([ [ buildMeta2, reviewMeta2 ] ])
    expect(saveQuestionSlot).toHaveBeenCalledWith("run-1", 0, second, [ buildMeta2, reviewMeta2 ])
  })

  it("flags the discarded first attempt's calls as wasted when the rewrite ships", async () => {
    reviewQuestion
      .mockResolvedValueOnce({ output: review(false), meta: reviewMeta1 })
      .mockResolvedValueOnce({ output: review(true), meta: reviewMeta2 })

    await run()

    const wasted = recordGenerationMeta.mock.calls.filter(c => c[3] === true).map(c => c[2])
    expect(wasted).toEqual([ buildMeta1, reviewMeta1 ])
    expect(recordGenerationMeta.mock.calls.every(c => c[0] === "prep")).toBe(true)
  })

  it("fails the slot after a second rejection, with no third attempt and all calls flagged wasted", async () => {
    reviewQuestion
      .mockResolvedValueOnce({ output: review(false), meta: reviewMeta1 })
      .mockResolvedValueOnce({ output: review(false), meta: reviewMeta2 })

    const result = await run()

    expect(buildFlashcard).toHaveBeenCalledTimes(2)
    expect(result.questions).toEqual([])
    expect(saveQuestionSlot).not.toHaveBeenCalled()
    const wasted = recordGenerationMeta.mock.calls.filter(c => c[3] === true).map(c => c[2])
    expect(wasted).toEqual([ buildMeta1, reviewMeta1, buildMeta2, reviewMeta2 ])
  })
})

describe("runPipeline agent failure", () => {
  it("fails the slot without a rewrite when an agent call throws, flagging completed calls wasted", async () => {
    singleSlotRun()
    const buildMeta1 = meta({ model: "build-1" })
    buildFlashcard.mockResolvedValue({ output: flashcard("first"), meta: buildMeta1 })
    reviewQuestion.mockRejectedValue(new Error("invalid JSON after retries"))
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const result = await run()

    expect(buildFlashcard).toHaveBeenCalledTimes(1)
    expect(result.questions).toEqual([])
    expect(recordGenerationMeta.mock.calls.filter(c => c[3] === true).map(c => c[2])).toEqual([ buildMeta1 ])
  })

  it("propagates cancellation instead of failing the slot", async () => {
    singleSlotRun()
    const abort = new Error("aborted")
    abort.name = "AbortError"
    buildFlashcard.mockRejectedValue(abort)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const result = await run()

    expect(result.questions).toEqual([])
    expect(recordGenerationMeta).not.toHaveBeenCalledWith("prep", "prep-1", expect.anything(), true)
  })
})
