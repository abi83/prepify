import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ExecutionConfig, Job, JobOutcome } from "@/core/job"
import { runGeneration, runOcr, type GenerationParams, type GenerationProgress } from "@/lib/jobs/clientExecution"
import type { PrepState } from "@/lib/planner"

const CONFIG: ExecutionConfig = { model: "m", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const TARGET = { questionCount: 1, enabledTypes: [ "flashcard" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } } as GenerationParams["target"]
const concept = { id: "c1", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], language: "en" as const }

const DONE_STATE: PrepState = { images: [ { id: "i1", ocrDone: true, concepts: { status: "pending" } } ], concepts: [ concept ], prepMetaDone: true, questionCount: 1, questionJobCount: 1, assetQuestionIds: [] }

const h = vi.hoisted(() => ({
  jobs: new Map<string, unknown>(),
  unfinished: [] as unknown[],
  state: null as unknown,
  ran: [] as string[],
  nextId: 0,
}))

vi.mock("@/actions/modelCatalog", async () => ({ getModelCatalog: async () => (await import("@/test/modelCatalog")).testCatalog }))
vi.mock("@/actions/jobs", () => ({
  createJob: async (type: string, inputIds: string[], config: unknown, question?: unknown) => {
    const job = { id: `new-${h.nextId++}`, type, status: "created", inputIds, config, question: question ?? null, output: null, failureReason: null }
    h.jobs.set(job.id, job)
    return job
  },
  getJob: async (id: string) => h.jobs.get(id) ?? null,
  existingIds: async (ids: string[]) => ids,
  commitJob: async (id: string, _from: string, outcome: JobOutcome<unknown>) => {
    h.jobs.set(id, { ...(h.jobs.get(id) as object), ...outcome })
    return true
  },
  listUnfinishedJobs: async () => h.unfinished,
}))
vi.mock("@/actions/prepImages", () => ({
  listMyPrepImages: async () => [ { id: "i1", gcsKey: "k", ocrResult: { text: "t", visual_elements: [] }, language: "en" } ],
}))
vi.mock("@/actions/prepState", () => ({ loadMyPrepState: async () => h.state }))
vi.mock("@/actions/questions", () => ({ loadMyQuestion: async () => { throw new Error("not used") } }))
vi.mock("@/actions/uploads", () => ({ getReadSignedUrl: async () => "https://example.test/img" }))

function fakeDefinition(type: string, output: unknown) {
  return () => ({ type, run: async () => { h.ran.push(type); return { output, metas: [], wastedMetas: [] } } })
}
vi.mock("../ocrJob", () => ({ createOcrJobDefinition: fakeDefinition("ocr", { language: "de" }) }))
vi.mock("../conceptsExtractJob", () => ({ createConceptsExtractJobDefinition: fakeDefinition("concepts.extract", null) }))
vi.mock("../prepMetaJob", () => ({ createPrepMetaJobDefinition: fakeDefinition("prep.meta", null) }))
vi.mock("../questionJob", () => ({ createQuestionJobDefinition: fakeDefinition("question", null) }))

function job(id: string, type: string, status: "created" | "failed"): Job {
  const base = { id, type, inputIds: type === "ocr" || type === "concepts.extract" ? [ "i1" ] : [ "c1" ], config: CONFIG, question: null }
  return status === "created"
    ? { ...base, status, output: null, failureReason: null }
    : { ...base, status, output: null, failureReason: "boom", terminal: false }
}

function params(events: GenerationProgress[] = []): GenerationParams {
  return {
    actorId: "u1", prepId: "p1", apiKey: "sk", model: "m", tier: "flex", target: TARGET,
    signal: new AbortController().signal,
    logger: { info() {}, warn() {}, error() {} } as unknown as GenerationParams["logger"],
    sampler: {} as GenerationParams["sampler"],
    onProgress: e => events.push(e),
  }
}

beforeEach(() => {
  h.jobs.clear()
  h.unfinished = []
  h.state = DONE_STATE
  h.ran = []
  h.nextId = 0
  vi.stubGlobal("fetch", async () => ({ blob: async () => new Blob([ "x" ], { type: "image/png" }) }))
  vi.stubGlobal("FileReader", class {
    result = "data:image/png;base64,eA=="
    onload: () => void = () => {}
    readAsDataURL() { queueMicrotask(() => this.onload()) }
  })
})

describe("runGeneration", () => {
  it("re-executes unfinished jobs in stage order, regardless of listing order", async () => {
    const unfinished = [ job("q1", "question", "created"), job("o1", "ocr", "failed"), job("c1", "concepts.extract", "created") ]
    h.unfinished = unfinished
    unfinished.forEach(j => h.jobs.set(j.id, j))

    await runGeneration(params())

    expect(h.ran).toEqual([ "ocr", "concepts.extract", "question" ])
  })

  it("runs nothing when no jobs are unfinished and the target is met", async () => {
    await runGeneration(params())
    expect(h.ran).toEqual([])
  })

  it("emits per-stage done/total progress and ends with done", async () => {
    const unfinished = [ job("o1", "ocr", "created"), job("o2", "ocr", "failed"), job("q1", "question", "created") ]
    h.unfinished = unfinished
    unfinished.forEach(j => h.jobs.set(j.id, j))
    const events: GenerationProgress[] = []

    await runGeneration(params(events))

    expect(events).toEqual([
      { stage: "ocr", done: 0, total: 2 },
      { stage: "ocr", done: 1, total: 2 },
      { stage: "ocr", done: 2, total: 2 },
      { stage: "questions", done: 0, total: 1 },
      { stage: "questions", done: 1, total: 1 },
      { stage: "done" },
    ])
  })
})

describe("runOcr", () => {
  it("runs nothing when there is nothing to do", async () => {
    await runOcr(params())
    expect(h.ran).toEqual([])
  })

  it("OCRs pending images", async () => {
    h.state = { ...DONE_STATE, images: [ { id: "i1", ocrDone: false, concepts: { status: "pending" } } ] }

    await runOcr(params())
    expect(h.ran).toEqual([ "ocr" ])
  })

  it("re-executes unfinished OCR jobs only", async () => {
    const unfinished = [ job("o1", "ocr", "failed"), job("q1", "question", "created") ]
    h.unfinished = unfinished
    unfinished.forEach(j => h.jobs.set(j.id, j))

    await runOcr(params())
    expect(h.ran).toEqual([ "ocr" ])
  })
})
