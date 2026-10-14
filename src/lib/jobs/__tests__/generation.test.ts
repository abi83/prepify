import { describe, expect, it, vi } from "vitest"

import { createInMemoryStore } from "@/core/inMemoryStore"
import type { ExecutionConfig } from "@/core/job"
import type { Llm } from "@/core/ports"
import { DEFAULT_CONCURRENCY, DEFAULT_JOB_SETTINGS, createNextJobs, runCreatedJobs, runGeneration, runOcr, untracked, type GenerationParams, type RunnerPorts } from "@/lib/jobs/generation"
import type { PrepState } from "@/lib/planner"

const CONFIG: ExecutionConfig = { model: "m", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const TARGET = { questionCount: 1, enabledTypes: [ "flashcard" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } } as GenerationParams["target"]
const PENDING_OCR: PrepState = { images: [ { id: "i1", ocrDone: false } ], concepts: [], prepMetaDone: false, questionCount: 0 }

const h = vi.hoisted(() => ({ llmsSeen: [] as unknown[] }))

vi.mock("../ocrJob", () => ({
  createOcrJobDefinition: (_images: unknown, deps: { llm: unknown }) => ({
    type: "ocr",
    run: async () => { h.llmsSeen.push(deps.llm); return { output: { language: "de" }, metas: [], wastedMetas: [] } },
  }),
}))

function params(): Omit<GenerationParams, "maxChars"> {
  return {
    actorId: "u1", prepId: "p1", apiKey: "sk", config: { model: "m", tier: "flex", ...DEFAULT_JOB_SETTINGS }, concurrency: DEFAULT_CONCURRENCY, target: TARGET,
    signal: new AbortController().signal,
    onProgress: () => {},
  }
}

/** A "root" differs from another only in the ports it builds. */
function root(llm: Llm, state: PrepState = PENDING_OCR): RunnerPorts {
  return {
    store: { ...createInMemoryStore(), existingIds: async (_actorId, ids) => new Set(ids) },
    llm,
    logger: { info() {}, warn() {}, error() {} } as unknown as RunnerPorts["logger"],
    sampler: {} as RunnerPorts["sampler"],
    data: {
      loadState: async () => state,
      listImages: async () => [ { id: "i1", gcsKey: "k", ocrResult: null, language: null } ],
      downloadImage: async () => ({ base64: "eA==", mimeType: "image/png" }),
    },
    listUnfinishedJobs: async () => [],
    trackRun: untracked,
  }
}

describe("generation with swapped roots", () => {
  it("runs the same OCR definition against whichever Store/Llm the root supplies", async () => {
    const llmA: Llm = { complete: () => { throw new Error("unused") } }
    const llmB: Llm = { complete: () => { throw new Error("unused") } }

    await runOcr(root(llmA), params())
    await runOcr(root(llmB), params())

    expect(h.llmsSeen).toEqual([ llmA, llmB ])
  })

  it("resumes the jobs the root's listUnfinishedJobs port returns", async () => {
    const done: PrepState = { images: [ { id: "i1", ocrDone: true } ], concepts: [ { id: "c1", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], language: "en" as const } ], prepMetaDone: true, questionCount: 1 }
    const ports = root({ complete: () => { throw new Error("unused") } }, done)
    const unfinished = await ports.store.createJob("u1", "ocr", [ "i1" ], CONFIG)
    h.llmsSeen.length = 0

    await runGeneration({ ...ports, listUnfinishedJobs: async () => [ unfinished ] }, { ...params(), maxChars: 1000 })

    expect(await ports.store.getJob("u1", unfinished.id)).toMatchObject({ status: "executed" })
  })
})

describe("create/run split", () => {
  const TWO_IMAGES: PrepState = { images: [ { id: "i1", ocrDone: false }, { id: "i2", ocrDone: false } ], concepts: [], prepMetaDone: false, questionCount: 0 }
  const unusedLlm: Llm = { complete: () => { throw new Error("unused") } }

  function twoImageRoot() {
    const ports = root(unusedLlm, TWO_IMAGES)
    ports.data.listImages = async () => [ { id: "i1", gcsKey: "k1", ocrResult: null, language: null }, { id: "i2", gcsKey: "k2", ocrResult: null, language: null } ]
    return ports
  }
  const runParams = (jobIds: string[]) => ({ ...params(), jobIds, maxChars: 1000 })

  it("createNextJobs persists created jobs carrying the config and runs nothing", async () => {
    const ports = twoImageRoot()
    h.llmsSeen.length = 0

    const jobs = await createNextJobs(ports, { actorId: "u1", prepId: "p1", config: CONFIG, target: TARGET })

    expect(jobs).toMatchObject([ { type: "ocr", inputIds: [ "i1" ], status: "created", config: CONFIG }, { type: "ocr", inputIds: [ "i2" ], status: "created", config: CONFIG } ])
    expect(await ports.store.getJob("u1", jobs[0].id)).toMatchObject({ status: "created", config: CONFIG })
    expect(h.llmsSeen).toEqual([])
  })

  it("createNextJobs throws while unfinished jobs exist", async () => {
    const ports = twoImageRoot()
    const unfinished = await ports.store.createJob("u1", "ocr", [ "i1" ], CONFIG)

    await expect(createNextJobs({ ...ports, listUnfinishedJobs: async () => [ unfinished ] }, { actorId: "u1", prepId: "p1", config: CONFIG, target: TARGET }))
      .rejects.toThrow(unfinished.id)
  })

  it("runCreatedJobs executes only the given ids", async () => {
    const ports = twoImageRoot()
    const [ first, second ] = await createNextJobs(ports, { actorId: "u1", prepId: "p1", config: CONFIG, target: TARGET })

    await runCreatedJobs(ports, runParams([ first.id ]))

    expect(await ports.store.getJob("u1", first.id)).toMatchObject({ status: "executed" })
    expect(await ports.store.getJob("u1", second.id)).toMatchObject({ status: "created" })
  })

  it("runCreatedJobs without ids executes every unfinished job", async () => {
    const ports = twoImageRoot()
    const created = await createNextJobs(ports, { actorId: "u1", prepId: "p1", config: CONFIG, target: TARGET })

    await runCreatedJobs({ ...ports, listUnfinishedJobs: async () => created }, runParams([]))

    for (const job of created) expect(await ports.store.getJob("u1", job.id)).toMatchObject({ status: "executed" })
  })

  it("runCreatedJobs throws on unknown and already executed ids", async () => {
    const ports = twoImageRoot()
    const [ first ] = await createNextJobs(ports, { actorId: "u1", prepId: "p1", config: CONFIG, target: TARGET })
    await runCreatedJobs(ports, runParams([ first.id ]))

    await expect(runCreatedJobs(ports, runParams([ "job-999" ]))).rejects.toThrow("Unknown job")
    await expect(runCreatedJobs(ports, runParams([ first.id ]))).rejects.toThrow("already executed")
  })
})
