import { describe, expect, it, vi } from "vitest"

import { createInMemoryStore } from "@/core/inMemoryStore"
import type { ExecutionConfig } from "@/core/job"
import type { Llm } from "@/core/ports"
import { runGeneration, runOcr, type GenerationParams, type RunnerPorts } from "@/lib/jobs/generation"
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

function params(): Omit<GenerationParams, "language" | "maxChars"> {
  return {
    actorId: "u1", prepId: "p1", apiKey: "sk", model: "m", tier: "flex", target: TARGET,
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
      listImages: async () => [ { id: "i1", gcsKey: "k", ocrResult: null } ],
      downloadImage: async () => ({ base64: "eA==", mimeType: "image/png" }),
    },
    listUnfinishedJobs: async () => [],
  }
}

describe("generation with swapped roots", () => {
  it("runs the same OCR definition against whichever Store/Llm the root supplies", async () => {
    const llmA: Llm = { complete: () => { throw new Error("unused") } }
    const llmB: Llm = { complete: () => { throw new Error("unused") } }

    expect(await runOcr(root(llmA), params())).toBe("de")
    expect(await runOcr(root(llmB), params())).toBe("de")

    expect(h.llmsSeen).toEqual([ llmA, llmB ])
  })

  it("resumes the jobs the root's listUnfinishedJobs port returns", async () => {
    const done: PrepState = { images: [ { id: "i1", ocrDone: true } ], concepts: [ { id: "c1", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [] } ], prepMetaDone: true, questionCount: 1 }
    const ports = root({ complete: () => { throw new Error("unused") } }, done)
    const unfinished = await ports.store.createJob("u1", "ocr", [ "i1" ], CONFIG)
    h.llmsSeen.length = 0

    await runGeneration({ ...ports, listUnfinishedJobs: async () => [ unfinished ] }, { ...params(), language: "en", maxChars: 1000 })

    expect(await ports.store.getJob("u1", unfinished.id)).toMatchObject({ status: "executed" })
  })
})
