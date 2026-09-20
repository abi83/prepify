import { describe, expect, it, vi } from "vitest"

vi.mock("../../actions/generationMeta", () => ({
  recordGenerationMeta: vi.fn().mockResolvedValue(undefined),
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
vi.mock("../agents/QuestionReviewer", () => ({ runQuestionReviewer: (...args: unknown[]) => reviewQuestion(...args) }))

import type { AgentMeta } from "../agent"
import { runPipeline } from "../pipeline"
import type { Concept, QuestionTask } from "../../types/pipeline"
import type { GeneratedQuestion } from "../../types/questions"

function emptyMeta(): AgentMeta {
  return { model: "", tier: "", promptTokens: 0, cachedTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, toolCalls: 0, executionMs: 0 }
}

function meta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return { ...emptyMeta(), model: "gpt-5-nano", tier: "flex", promptTokens: 100, completionTokens: 50, totalTokens: 150, costUsd: 0.0003, executionMs: 500, ...overrides }
}

const concept: Concept = { name: "Concept", description: "x".repeat(40), importance: 0.5, misconceptions: [] }
const task: QuestionTask = { concepts: [ concept ], type: "flashcard" }

function flashcard(front: string): GeneratedQuestion {
  return {
    type: "flashcard",
    content: { front, back: "A", back_explanation: "", asset_hint: { needed: false, type: null, description: null } },
  }
}

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
    reviewQuestion.mockResolvedValue({ output: { question: builtQuestion }, meta: reviewMeta })

    const result = await runPipeline({
      prepId: "prep-1",
      pages: [],
      apiKey: "key",
      model: "model",
      onProgress: vi.fn(),
    })

    expect(result.questions).toEqual([ resumedQuestion, builtQuestion ])
    expect(result.questionMeta).toEqual([
      [ resumedMeta ],
      [ builtMeta, reviewMeta ],
    ])
    expect(saveQuestionSlot).toHaveBeenCalledWith("run-1", 1, builtQuestion, [ builtMeta, reviewMeta ])
  })
})
