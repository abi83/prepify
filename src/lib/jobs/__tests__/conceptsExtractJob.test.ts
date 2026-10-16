import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/currentUser", () => ({ requireUserId: async () => "user-owner" }))

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runConceptExtractor = vi.fn()
vi.mock("@/lib/agents/ConceptExtractor", () => ({ runConceptExtractor: (...args: unknown[]) => runConceptExtractor(...args) }))

import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { runJob } from "@/core/runJob"
import { createConceptsExtractJobDefinition } from "@/lib/jobs/conceptsExtractJob"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { loadPrepState } from "@/repositories/prepStateRepository"
import { testCatalog } from "@/test/modelCatalog"
import type { PageConcepts } from "@/types/pipeline"

const OWNER = "user-owner"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }
const META = { model: "gpt-5-nano", tier: "flex", temperature: 1, maxTokens: 1000, promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }
const PAGE = { page: 1, title: "Cells", text: "t", gcsKey: "k", visual_elements: [], language: "de" as const }

const FOUND: PageConcepts = {
  status: "found",
  concepts: [ { name: "Mitosis", description: "Cell division process in eukaryotes that yields two identical cells", importance: 0.9, misconceptions: [], language: "de" } ],
}

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
  runConceptExtractor.mockReset()
})

async function extract(output: PageConcepts, imageId: string) {
  runConceptExtractor.mockResolvedValue({ output, meta: META })
  const store = createPrismaStore()
  const job = await store.createJob(OWNER, "concepts.extract", [ imageId ], CONFIG)
  const result = await runJob(
    createConceptsExtractJobDefinition(PAGE, { llm: NOOP_LLM, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog }),
    { store, llm: NOOP_LLM, progress: NOOP_PROGRESS },
    { actorId: OWNER, jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal },
  )
  return { job, result }
}

describe("concepts.extract job", () => {
  it("keeps the page's concepts on the job, writes no Concept rows, and records a GenerationMeta row", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: null })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    const { job, result } = await extract(FOUND, image.id)

    expect(result).toMatchObject({ committed: true, status: "executed", output: FOUND })
    expect(await prisma.concept.count()).toBe(0)
    expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(1)
  })

  it("is read back by loadPrepState as the image's found or empty outcome, pending until it ran", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: null })
    const [ first, second, third ] = await Promise.all([ "a", "b", "c" ].map(key => prepImageRepository.createImage(OWNER, prep.id, key)))

    await extract(FOUND, first.id)
    await extract({ status: "empty", reason: "not_educational" }, second.id)

    const { images } = await loadPrepState(prep.id)
    expect(images.find(image => image.id === first.id)?.concepts).toEqual(FOUND)
    expect(images.find(image => image.id === second.id)?.concepts).toEqual({ status: "empty", reason: "not_educational" })
    expect(images.find(image => image.id === third.id)?.concepts).toEqual({ status: "pending" })
  })
})
