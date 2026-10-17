import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { ExecutionConfig, JobOutcome } from "@/core/job"
import { prisma } from "@/lib/prisma"
import { claimJob, createPrismaStore, MAX_JOB_ATTEMPTS, retryTerminalJobs } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

const USER = "user-1"
const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const META = { model: "gpt-5-nano", tier: "flex", temperature: 1, maxTokens: 32_000, promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }
const EXECUTED: JobOutcome<unknown> = { status: "executed", output: { title: "T", text: "x", visual_elements: [], language: "en" }, metas: [ META ], wastedMetas: [] }
const FAILED: JobOutcome<unknown> = { status: "failed", failureReason: "boom", wastedMetas: [] }

const store = createPrismaStore()

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

const statusOf = async (id: string) => (await prisma.prep.findUniqueOrThrow({ where: { id } })).status

async function makePrepWithOcrJob() {
  const prep = await prepRepository.createPrep(USER, { title: "Prep", language: "en" })
  const image = await prepImageRepository.createImage(USER, prep.id, `prep-pages/${prep.id}/key`)
  const job = await store.createJob(USER, "ocr", [ image.id ], CONFIG)
  return { prep, job }
}

describe("Prep.status", () => {
  it("is draft before any job exists", async () => {
    const prep = await prepRepository.createPrep(USER, { title: "Prep", language: "en" })
    expect(prep.status).toBe("draft")
  })

  it("is processing once a run plans its first job", async () => {
    const { prep } = await makePrepWithOcrJob()
    expect(await statusOf(prep.id)).toBe("processing")
  })

  it("is ready once every planned job executed", async () => {
    const { prep, job } = await makePrepWithOcrJob()
    await store.commitJob(USER, job.id, "created", EXECUTED)
    expect(await statusOf(prep.id)).toBe("ready")
  })

  it("returns to processing when a later job is planned", async () => {
    const { prep, job } = await makePrepWithOcrJob()
    await store.commitJob(USER, job.id, "created", EXECUTED)
    const image = await prisma.prepImage.findFirstOrThrow({ where: { prepId: prep.id } })
    await store.createJob(USER, "concepts.extract", [ image.id ], CONFIG)
    expect(await statusOf(prep.id)).toBe("processing")
  })

  it("stays processing across an interrupted run and a failure with attempts left", async () => {
    const { prep, job } = await makePrepWithOcrJob()
    await claimJob(job.id)
    await prisma.job.update({ where: { id: job.id }, data: { status: "interrupted" } })
    expect(await statusOf(prep.id)).toBe("processing")

    await claimJob(job.id)
    await store.commitJob(USER, job.id, "interrupted", FAILED)
    expect(await statusOf(prep.id)).toBe("processing")
  })

  it("is failed after a blocking job fails past its attempt cap, and processing again after a retry", async () => {
    const { prep, job } = await makePrepWithOcrJob()
    await prisma.job.update({ where: { id: job.id }, data: { attempts: MAX_JOB_ATTEMPTS } })
    await store.commitJob(USER, job.id, "created", FAILED)
    expect(await statusOf(prep.id)).toBe("failed")

    await retryTerminalJobs(USER, prep.id)
    expect(await statusOf(prep.id)).toBe("processing")
  })
})
