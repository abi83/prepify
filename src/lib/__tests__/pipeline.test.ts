import { beforeEach, describe, expect, it, vi } from "vitest"

const recordGenerationMeta = vi.fn().mockResolvedValue(undefined)
const recordGenerationMetaMany = vi.fn().mockResolvedValue(undefined)
vi.mock("../../actions/generationMeta", () => ({
  recordGenerationMeta: (...args: unknown[]) => recordGenerationMeta(...args),
  recordGenerationMetaMany: (...args: unknown[]) => recordGenerationMetaMany(...args),
}))

const saveAttemptBuild = vi.fn().mockResolvedValue(undefined)
const saveAttemptReview = vi.fn().mockResolvedValue(undefined)
const finishSlot = vi.fn().mockResolvedValue(undefined)
const failSlot = vi.fn().mockResolvedValue(undefined)
const loadOrCreateRun = vi.fn()

vi.mock("../../actions/pipeline", () => ({
  loadOrCreateRun: (...args: unknown[]) => loadOrCreateRun(...args),
  saveConcepts: vi.fn().mockResolvedValue(undefined),
  saveQuestionTasksAndInitSlots: vi.fn().mockResolvedValue(undefined),
  saveAttemptBuild: (...args: unknown[]) => saveAttemptBuild(...args),
  saveAttemptReview: (...args: unknown[]) => saveAttemptReview(...args),
  finishSlot: (...args: unknown[]) => finishSlot(...args),
  failSlot: (...args: unknown[]) => failSlot(...args),
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

import type { PipelineSlotState } from "../../repositories/pipelineRepository"
import type { Concept, PipelineAttempt, QuestionTask } from "../../types/pipeline"
import type { GeneratedQuestion } from "../../types/questions"
import type { AgentMeta } from "../agent"
import type { Review } from "../agents/QuestionReviewer"
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

function review(passed: boolean): Review {
  const metric = { score: passed ? 1 : 0.5, comment: "c" }
  return { scores: { correctness: metric, conceptAlignment: metric, clarity: metric, cognitiveDemand: metric, distractorQuality: null }, comment: "overall" }
}

function reviewedOutput(passed: boolean) {
  return { review: review(passed), passed }
}

/** A finished slot, as `loadOrCreateRun` would report it. */
function finishedSlot(question: GeneratedQuestion, m: AgentMeta[]): PipelineSlotState {
  return { status: "finished", attempts: [], question, meta: m }
}

/** A pending slot, optionally resuming from persisted attempts (defaults to a brand-new slot). */
function pendingSlot(attempts: PipelineAttempt[] = []): PipelineSlotState {
  return { status: "pending", attempts, question: null, meta: null }
}

function failedSlot(): PipelineSlotState {
  return { status: "failed", attempts: [], question: null, meta: null }
}

function singleSlotRun(slot = pendingSlot()) {
  loadOrCreateRun.mockResolvedValue({
    runId: "run-1",
    concepts: [ concept ],
    questionTasks: [ task ],
    slots: new Map([ [ 0, slot ] ]),
  })
}

function run() {
  return runPipeline({ prepId: "prep-1", pages: [], apiKey: "key", model: "model", onProgress: vi.fn() })
}

/** Every `metas` argument recordGenerationMetaMany was called with, wasted calls only, flattened in call order. */
function wastedMetas(): AgentMeta[] {
  return recordGenerationMetaMany.mock.calls.filter(c => c[3] === true).flatMap(c => c[2])
}

beforeEach(() => {
  vi.clearAllMocks()
  buildFlashcard.mockReset()
  reviewQuestion.mockReset()
})

describe("runPipeline resume", () => {
  it("keeps a finished slot's persisted meta, alongside a newly built slot", async () => {
    const resumedQuestion = flashcard("resumed")
    const resumedMeta = meta({ model: "resumed-model" })
    const builtMeta = meta({ model: "build-model" })
    const reviewMeta = meta({ model: "review-model" })

    loadOrCreateRun.mockResolvedValue({
      runId: "run-1",
      concepts: [ concept ],
      questionTasks: [ task, task ],
      slots: new Map([ [ 0, finishedSlot(resumedQuestion, [ resumedMeta ]) ], [ 1, pendingSlot() ] ]),
    })

    const builtQuestion = flashcard("built")
    buildFlashcard.mockResolvedValue({ output: builtQuestion, meta: builtMeta })
    reviewQuestion.mockResolvedValue({ output: reviewedOutput(true), meta: reviewMeta })

    const result = await run()

    expect(result.questions).toEqual([ { ...resumedQuestion, difficulty: "easy" }, { ...builtQuestion, difficulty: "easy" } ])
    expect(result.questionMeta).toEqual([
      [ resumedMeta ],
      [ builtMeta, reviewMeta ],
    ])
    expect(result.failedCount).toBe(0)
    expect(finishSlot).toHaveBeenCalledWith("run-1", 1, builtQuestion, [ builtMeta, reviewMeta ])
  })

  it("skips a failed slot entirely — no rebuild, excluded from questions, counted as failed", async () => {
    const finishedQuestion = flashcard("ok")
    loadOrCreateRun.mockResolvedValue({
      runId: "run-1",
      concepts: [ concept ],
      questionTasks: [ task, task ],
      slots: new Map([ [ 0, finishedSlot(finishedQuestion, [ meta() ]) ], [ 1, failedSlot() ] ]),
    })

    const result = await run()

    expect(buildFlashcard).not.toHaveBeenCalled()
    expect(reviewQuestion).not.toHaveBeenCalled()
    expect(failSlot).not.toHaveBeenCalled()
    expect(result.questions).toEqual([ { ...finishedQuestion, difficulty: "easy" } ])
    expect(result.failedCount).toBe(1)
  })

  it("resumes a slot whose build was persisted but never reviewed — no rebuild, reviews the persisted question", async () => {
    const persistedBuild = flashcard("persisted")
    const persistedBuildMeta = meta({ model: "persisted-build" })
    const reviewMeta = meta({ model: "review-model" })

    singleSlotRun(pendingSlot([ { attemptNum: 1, build: { question: persistedBuild, meta: persistedBuildMeta }, review: null } ]))
    reviewQuestion.mockResolvedValue({ output: reviewedOutput(true), meta: reviewMeta })

    const result = await run()

    expect(buildFlashcard).not.toHaveBeenCalled()
    expect(saveAttemptBuild).not.toHaveBeenCalled()
    expect(reviewQuestion.mock.calls[0][0]).toBe(persistedBuild)
    expect(result.questions).toEqual([ { ...persistedBuild, difficulty: "easy" } ])
    expect(finishSlot).toHaveBeenCalledWith("run-1", 0, persistedBuild, [ persistedBuildMeta, reviewMeta ])
  })

  it("resumes a slot whose only attempt was rejected — rewrites using the persisted feedback", async () => {
    const rejected = flashcard("rejected")
    const rejectedBuildMeta = meta({ model: "rejected-build" })
    const rejectedReviewMeta = meta({ model: "rejected-review" })
    singleSlotRun(pendingSlot([
      { attemptNum: 1, build: { question: rejected, meta: rejectedBuildMeta }, review: { review: review(false), passed: false, meta: rejectedReviewMeta } },
    ]))

    const rewritten = flashcard("rewritten")
    buildFlashcard.mockResolvedValue({ output: rewritten, meta: meta({ model: "rewrite-build" }) })
    reviewQuestion.mockResolvedValue({ output: reviewedOutput(true), meta: meta({ model: "rewrite-review" }) })

    const result = await run()

    expect(buildFlashcard).toHaveBeenCalledTimes(1)
    expect(buildFlashcard.mock.calls[0][5]).toEqual({ question: rejected, feedback: expect.stringContaining("overall") })
    expect(saveAttemptBuild).toHaveBeenCalledWith("run-1", 0, 2, rewritten, expect.anything())
    expect(result.questions).toEqual([ { ...rewritten, difficulty: "easy" } ])
  })

  it("finishes a slot whose review already passed but the crash happened before finishSlot — no new calls", async () => {
    const built = flashcard("built")
    const buildMeta = meta({ model: "build" })
    const reviewMeta = meta({ model: "review" })
    singleSlotRun(pendingSlot([
      { attemptNum: 1, build: { question: built, meta: buildMeta }, review: { review: review(true), passed: true, meta: reviewMeta } },
    ]))

    const result = await run()

    expect(buildFlashcard).not.toHaveBeenCalled()
    expect(reviewQuestion).not.toHaveBeenCalled()
    expect(result.questions).toEqual([ { ...built, difficulty: "easy" } ])
    expect(finishSlot).toHaveBeenCalledWith("run-1", 0, built, [ buildMeta, reviewMeta ])
  })
})

describe("runPipeline per-step persistence", () => {
  it("persists each build and review as it completes", async () => {
    singleSlotRun()
    const built = flashcard("built")
    const buildMeta = meta({ model: "build" })
    const reviewMeta = meta({ model: "review" })
    buildFlashcard.mockResolvedValue({ output: built, meta: buildMeta })
    reviewQuestion.mockResolvedValue({ output: reviewedOutput(true), meta: reviewMeta })

    await run()

    expect(saveAttemptBuild).toHaveBeenCalledWith("run-1", 0, 1, built, buildMeta)
    expect(saveAttemptReview).toHaveBeenCalledWith("run-1", 0, 1, review(true), true, reviewMeta)
    expect(finishSlot).toHaveBeenCalledWith("run-1", 0, built, [ buildMeta, reviewMeta ])
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
      .mockResolvedValueOnce({ output: reviewedOutput(false), meta: reviewMeta1 })
      .mockResolvedValueOnce({ output: reviewedOutput(true), meta: reviewMeta2 })

    const result = await run()

    expect(buildFlashcard.mock.calls[1][5]).toEqual({ question: first, feedback: expect.stringContaining("overall") })
    expect(reviewQuestion).toHaveBeenCalledTimes(2)
    expect(reviewQuestion.mock.calls[1][0]).toBe(second)
    expect(reviewQuestion.mock.calls[1]).toHaveLength(6) // no prior-review context passed
    expect(result.questions).toEqual([ { ...second, difficulty: "easy" } ])
    expect(result.questionMeta).toEqual([ [ buildMeta2, reviewMeta2 ] ])
    expect(finishSlot).toHaveBeenCalledWith("run-1", 0, second, [ buildMeta2, reviewMeta2 ])
    expect(failSlot).not.toHaveBeenCalled()
  })

  it("flags the discarded first attempt's calls as wasted when the rewrite ships", async () => {
    reviewQuestion
      .mockResolvedValueOnce({ output: reviewedOutput(false), meta: reviewMeta1 })
      .mockResolvedValueOnce({ output: reviewedOutput(true), meta: reviewMeta2 })

    await run()

    expect(wastedMetas()).toEqual([ buildMeta1, reviewMeta1 ])
    expect(recordGenerationMetaMany.mock.calls.every(c => c[0] === "prep")).toBe(true)
  })

  it("fails the slot after a second rejection, with no third attempt and all calls flagged wasted", async () => {
    reviewQuestion
      .mockResolvedValueOnce({ output: reviewedOutput(false), meta: reviewMeta1 })
      .mockResolvedValueOnce({ output: reviewedOutput(false), meta: reviewMeta2 })

    const result = await run()

    expect(buildFlashcard).toHaveBeenCalledTimes(2)
    expect(result.questions).toEqual([])
    expect(result.failedCount).toBe(1)
    expect(finishSlot).not.toHaveBeenCalled()
    expect(failSlot).toHaveBeenCalledWith("run-1", 0)
    expect(wastedMetas()).toEqual([ buildMeta1, reviewMeta1, buildMeta2, reviewMeta2 ])
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
    expect(result.failedCount).toBe(1)
    expect(failSlot).toHaveBeenCalledWith("run-1", 0)
    expect(wastedMetas()).toEqual([ buildMeta1 ])
  })

  it("propagates cancellation, still flagging the calls it already billed as wasted, without failing the slot", async () => {
    singleSlotRun()
    const buildMeta1 = meta({ model: "build-1" })
    buildFlashcard.mockResolvedValue({ output: flashcard("first"), meta: buildMeta1 })
    const abort = new Error("aborted")
    abort.name = "AbortError"
    reviewQuestion.mockRejectedValue(abort)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const result = await run()

    expect(result.questions).toEqual([])
    expect(failSlot).not.toHaveBeenCalled()
    expect(wastedMetas()).toEqual([ buildMeta1 ])
  })
})

describe("runPipeline progress events", () => {
  it("emits a rewriting stage for a second-attempt build, and a done stage carrying the failed count", async () => {
    loadOrCreateRun.mockResolvedValue({
      runId: "run-1",
      concepts: [ concept ],
      questionTasks: [ task ],
      slots: new Map([ [ 0, pendingSlot() ] ]),
    })
    buildFlashcard
      .mockResolvedValueOnce({ output: flashcard("first"), meta: meta() })
      .mockResolvedValueOnce({ output: flashcard("second"), meta: meta() })
    reviewQuestion
      .mockResolvedValueOnce({ output: reviewedOutput(false), meta: meta() })
      .mockResolvedValueOnce({ output: reviewedOutput(true), meta: meta() })

    const events: string[] = []
    await runPipeline({ prepId: "prep-1", pages: [], apiKey: "key", model: "model", onProgress: e => events.push(e.stage) })

    expect(events).toContain("rewriting")
    expect(events[events.length - 1]).toBe("done")
  })
})
