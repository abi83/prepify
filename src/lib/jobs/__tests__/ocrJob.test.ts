import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/currentUser", () => ({ requireUserId: async () => "user-owner" }))

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runOcrAgent = vi.fn()
vi.mock("@/lib/agents/OcrAgent", async importActual => ({ ...await importActual<typeof import("@/lib/agents/OcrAgent")>(), runOcrAgent: (...args: unknown[]) => runOcrAgent(...args) }))

import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { runJob } from "@/core/runJob"
import { OcrRejectedError } from "@/lib/agents/OcrAgent"
import { createOcrJobDefinition } from "@/lib/jobs/ocrJob"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { testCatalog } from "@/test/modelCatalog"

const OWNER = "user-owner"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
  runOcrAgent.mockReset()
})

describe("ocr job", () => {
  it("runs end-to-end: OCR fields and a linked GenerationMeta row are persisted", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    runOcrAgent.mockResolvedValue({
      output: { title: "Cells", text: "hello page", confidence: 0.9, language: "de", visual_elements: [] },
      meta: { model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 },
    })

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const definition = createOcrJobDefinition([ { base64: "ZmFrZQ==", mimeType: "image/jpeg" } ], { llm: NOOP_LLM, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog })
    const result = await runJob(
      definition,
      { store, llm: NOOP_LLM, progress: NOOP_PROGRESS },
      { actorId: OWNER, jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal },
    )

    expect(result).toMatchObject({ committed: true, status: "executed" })
    expect(runOcrAgent.mock.calls[0][4]).toMatchObject({ timeoutMs: CONFIG.timeoutMs })

    const finishedJob = await store.getJob(OWNER, job.id)
    expect(finishedJob).toMatchObject({ status: "executed" })

    const reloadedImage = await prisma.prepImage.findUniqueOrThrow({ where: { id: image.id } })
    expect(reloadedImage.producedByJobId).toBe(job.id)
    expect(reloadedImage.ocrResult).toEqual({ title: "Cells", text: "hello page", visual_elements: [] })
    expect(reloadedImage.language).toBe("de")

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(1)
    expect(metas[0]).toMatchObject({ jobId: job.id, promptTokens: 10, completionTokens: 5 })
  })

  it("records the rejected call as a wasted GenerationMeta on the failed job", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")
    const meta = { model: "gpt-5-nano", tier: "flex", temperature: 1, maxTokens: 1000, promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }
    runOcrAgent.mockRejectedValue(new OcrRejectedError(meta, new Error("low_confidence:0.2")))

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const definition = createOcrJobDefinition([ { base64: "ZmFrZQ==", mimeType: "image/jpeg" } ], { llm: NOOP_LLM, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog })
    const result = await runJob(
      definition,
      { store, llm: NOOP_LLM, progress: NOOP_PROGRESS },
      { actorId: OWNER, jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal },
    )

    expect(result).toMatchObject({ committed: true, status: "failed", failureReason: "low_confidence:0.2" })
    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toMatchObject([ { promptTokens: 10, completionTokens: 5, wasted: true } ])
  })
})
