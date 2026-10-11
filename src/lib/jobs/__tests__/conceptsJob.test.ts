import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runConceptExtractor = vi.fn()
vi.mock("@/lib/agents/ConceptExtractor", () => ({ runConceptExtractor: (...args: unknown[]) => runConceptExtractor(...args) }))

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

const OWNER = "user-owner"
const OTHER = "user-other"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

const META = { model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
  runConceptExtractor.mockReset()
  runConceptMerger.mockReset()
})

describe("concepts job", () => {
  it("runs end-to-end: merged Concept rows and a GenerationMeta row per LLM call are persisted", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    const extracted = [
      { name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [] },
      { name: "cell division", description: "Cell division process in eukaryotes", importance: 0.8, misconceptions: [] },
    ]
    runConceptExtractor.mockResolvedValue({ output: extracted, meta: META, chunkCount: 2, metas: [ META, META ] })
    runConceptMerger.mockResolvedValue({
      output: [ { name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [] } ],
      meta: META,
    })

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "concepts", [ image.id ], CONFIG)

    const definition = createConceptsJobDefinition([], "en", consoleLogger, noopSampler)
    const result = await runJob(
      definition,
      { store, llm: NOOP_LLM, progress: NOOP_PROGRESS },
      { actorId: OWNER, jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal },
    )

    expect(result).toMatchObject({ committed: true, status: "executed" })

    const finishedJob = await store.getJob(OWNER, job.id)
    expect(finishedJob).toMatchObject({ status: "executed" })

    const concepts = await prisma.concept.findMany({ where: { producedByJobId: job.id } })
    expect(concepts).toHaveLength(1)
    expect(concepts[0]).toMatchObject({ name: "Mitosis", importance: 0.9 })

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(3)
    expect(metas[0]).toMatchObject({ entityType: "prep", entityId: prep.id, promptTokens: 10 })
  })

  it("rejects a non-owner actor", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")
    const store = createPrismaStore()

    await expect(store.createJob(OTHER, "concepts", [ image.id ], CONFIG)).rejects.toThrow(ForbiddenError)
  })
})
