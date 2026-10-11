import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

const runOcrAgent = vi.fn()
vi.mock("@/lib/agents/OcrAgent", () => ({ runOcrAgent: (...args: unknown[]) => runOcrAgent(...args) }))

import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { runJob } from "@/core/runJob"
import { createOcrJobDefinition } from "@/lib/jobs/ocrJob"
import { consoleLogger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

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
      output: { text: "hello page", confidence: 0.9, language: "en", visual_elements: [] },
      meta: { model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 },
    })

    const store = createPrismaStore()
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const definition = createOcrJobDefinition([ { base64: "ZmFrZQ==", mimeType: "image/jpeg" } ], consoleLogger, noopSampler)
    const result = await runJob(
      definition,
      { store, llm: NOOP_LLM, progress: NOOP_PROGRESS },
      { actorId: OWNER, jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal },
    )

    expect(result).toMatchObject({ committed: true, status: "executed" })

    const finishedJob = await store.getJob(OWNER, job.id)
    expect(finishedJob).toMatchObject({ status: "executed" })

    const reloadedImage = await prisma.prepImage.findUniqueOrThrow({ where: { id: image.id } })
    expect(reloadedImage.producedByJobId).toBe(job.id)
    expect(reloadedImage.ocrResult).toEqual({ text: "hello page", visual_elements: [] })

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(1)
    expect(metas[0]).toMatchObject({ entityType: "prep", entityId: prep.id, promptTokens: 10, completionTokens: 5 })
  })
})
