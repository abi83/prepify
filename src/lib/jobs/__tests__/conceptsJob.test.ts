import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/currentUser", () => ({ requireUserId: async () => "user-owner" }))

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runConceptMerger = vi.fn()
vi.mock("@/lib/agents/ConceptMerger", () => ({ runConceptMerger: (...args: unknown[]) => runConceptMerger(...args) }))

import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { runJob } from "@/core/runJob"
import { createConceptsJobDefinition } from "@/lib/jobs/conceptsJob"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { ForbiddenError } from "@/repositories/errors"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { testCatalog } from "@/test/modelCatalog"
import type { StoredConcept } from "@/types/pipeline"

const OWNER = "user-owner"
const OTHER = "user-other"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }
const DEPS = { llm: NOOP_LLM, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog }

const META = { model: "gpt-5-nano", tier: "flex", temperature: 1, maxTokens: 1000, promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }

const concept = (name: string, importance: number): StoredConcept => ({
  name, description: "Cell division process in eukaryotes that yields two identical cells", importance, misconceptions: [], language: "de",
})

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
  runConceptMerger.mockReset()
})

async function createPrepWithImages(count: number) {
  const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: null })
  const images = await Promise.all(Array.from({ length: count }, (_, i) => prepImageRepository.createImage(OWNER, prep.id, `prep-pages/${prep.id}/key-${i}`)))
  return { prep, imageIds: images.map(image => image.id) }
}

type StoredWithId = StoredConcept & { id: string }

function run(jobId: string, incoming: StoredConcept[], stored: StoredWithId[] = []) {
  return runJob(
    createConceptsJobDefinition(incoming, stored, DEPS),
    { store: createPrismaStore(), llm: NOOP_LLM, progress: NOOP_PROGRESS },
    { actorId: OWNER, jobId, apiKey: "sk-test", signal: new AbortController().signal },
  )
}

describe("concepts job", () => {
  it("inserts a page's concepts as they are when the prep has none yet, without an LLM call", async () => {
    const { prep, imageIds } = await createPrepWithImages(1)
    const job = await createPrismaStore().createJob(OWNER, "concepts", imageIds, CONFIG)

    const result = await run(job.id, [ concept("Mitosis", 0.9), concept("Meiosis", 0.8) ])

    expect(result).toMatchObject({ committed: true, status: "executed" })
    expect(runConceptMerger).not.toHaveBeenCalled()
    expect(await prisma.concept.findMany({ where: { producedByJobId: job.id }, orderBy: { name: "asc" } })).toMatchObject([ { name: "Meiosis" }, { name: "Mitosis" } ])
    expect((await prisma.prep.findUniqueOrThrow({ where: { id: prep.id } })).language).toBe("de")
    expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(0)
  })

  it("inserts only the incoming concepts the merger marks new and records its GenerationMeta", async () => {
    const { imageIds } = await createPrepWithImages(2)
    const stored = { ...concept("Mitosis", 0.9), id: "stored-1" }
    runConceptMerger.mockResolvedValue({
      output: [ { concept: concept("cell division", 0.8), duplicateOfId: "stored-1" }, { concept: concept("Meiosis", 0.7), duplicateOfId: null } ],
      meta: META,
    })
    const job = await createPrismaStore().createJob(OWNER, "concepts", [ imageIds[1] ], CONFIG)

    const result = await run(job.id, [ concept("cell division", 0.8), concept("Meiosis", 0.7) ], [ stored ])

    expect(result).toMatchObject({ committed: true, status: "executed" })
    expect(runConceptMerger).toHaveBeenCalledWith([ concept("cell division", 0.8), concept("Meiosis", 0.7) ], [ stored ], "gpt-5-nano", "flex", expect.anything(), expect.anything())
    expect(await prisma.concept.findMany({ where: { producedByJobId: job.id } })).toMatchObject([ { name: "Meiosis", language: "de" } ])
    expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(1)
  })

  it("executes with no new concepts when every incoming one is a duplicate", async () => {
    const { imageIds } = await createPrepWithImages(2)
    const stored = { ...concept("Mitosis", 0.9), id: "stored-1" }
    runConceptMerger.mockResolvedValue({ output: [ { concept: concept("cell division", 0.8), duplicateOfId: "stored-1" } ], meta: META })
    const job = await createPrismaStore().createJob(OWNER, "concepts", [ imageIds[1] ], CONFIG)

    const result = await run(job.id, [ concept("cell division", 0.8) ], [ stored ])

    expect(result).toMatchObject({ committed: true, status: "executed" })
    expect(await prisma.concept.count()).toBe(0)
  })

  it("throws when the incoming and stored concepts span languages", () => {
    expect(() => createConceptsJobDefinition([ { ...concept("Mitose", 0.9), language: "fr" } ], [ { ...concept("Mitosis", 0.9), id: "stored-1" } ], DEPS))
      .toThrow("more than one language")
  })

  it("rejects a non-owner actor", async () => {
    const { imageIds } = await createPrepWithImages(1)

    await expect(createPrismaStore().createJob(OTHER, "concepts", imageIds, CONFIG)).rejects.toThrow(ForbiddenError)
  })
})
