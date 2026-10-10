import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runPrepNamer = vi.fn()
vi.mock("@/lib/agents/PrepNamer", () => ({ runPrepNamer: (...args: unknown[]) => runPrepNamer(...args) }))

const runPrepLabeler = vi.fn()
vi.mock("@/lib/agents/PrepLabeler", () => ({ runPrepLabeler: (...args: unknown[]) => runPrepLabeler(...args) }))

import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { runJob } from "@/core/runJob"
import { createPrepMetaJobDefinition } from "@/lib/jobs/prepMetaJob"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { ForbiddenError } from "@/repositories/errors"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepRepository from "@/repositories/prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

const META = { model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }

const CONCEPT = { name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [] }

async function makeConcept(userId: string) {
  const prep = await prepRepository.createPrep(userId, { title: "Prep", language: "en" })
  const conceptsJob = await prisma.job.create({
    data: {
      prepId: prep.id, type: "concepts", status: "executed",
      model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0,
      createdBy: userId, output: [],
    },
  })
  const concept = await prisma.concept.create({ data: { ...CONCEPT, producedByJobId: conceptsJob.id } })
  return { prep, concept }
}

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
  runPrepNamer.mockReset()
  runPrepLabeler.mockReset()
})

describe("prep.meta job", () => {
  it("runs end-to-end: Prep title/description/grade/discipline and GenerationMeta rows are persisted", async () => {
    const { prep, concept } = await makeConcept(OWNER)

    runPrepNamer.mockResolvedValue({
      output: { title: "Cell Division", description: "Covers mitosis and the stages of eukaryotic cell division in detail." },
      meta: META,
    })
    runPrepLabeler.mockResolvedValue({ output: { grade: 9, discipline: "Biology", confidence: 0.9 }, meta: META })

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "prep.meta", [ concept.id ], CONFIG)

    const definition = createPrepMetaJobDefinition([ CONCEPT ], "en", consoleLogger)
    const result = await runJob(
      definition,
      { store, llm: NOOP_LLM, progress: NOOP_PROGRESS },
      { actorId: OWNER, jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal },
    )

    expect(result).toMatchObject({ committed: true, status: "executed" })

    const reloadedPrep = await prisma.prep.findUniqueOrThrow({ where: { id: prep.id } })
    expect(reloadedPrep).toMatchObject({
      title: "Cell Division",
      description: "Covers mitosis and the stages of eukaryotic cell division in detail.",
      grade: 9,
      discipline: "Biology",
    })

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(2)
    expect(metas[0]).toMatchObject({ entityType: "prep", entityId: prep.id, promptTokens: 10 })
  })

  it("rejects a non-owner actor", async () => {
    const { concept } = await makeConcept(OWNER)
    const store = createPrismaStore()

    await expect(store.createJob(OTHER, "prep.meta", [ concept.id ], CONFIG)).rejects.toThrow(ForbiddenError)
  })
})
