import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import { prisma } from "@/lib/prisma"
import { claimJob, createPrismaStore, hasActiveRun, interruptStaleJobs, listUnfinishedJobs, markInterrupted, MAX_JOB_ATTEMPTS, retryFailedPages, retryJob, retryTerminalJobs, STALE_HEARTBEAT_MS } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { getPrepProgress } from "@/repositories/prepStateRepository"

const USER = "user-1"
const CONFIG = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const store = createPrismaStore()

const ago = (ms: number) => new Date(Date.now() - ms)

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

async function makeJob(status: "created" | "running" | "interrupted" | "failed", heartbeatAt: Date | null, attempts = 0) {
  const prep = await prepRepository.createPrep(USER, { title: "Prep", language: "en" })
  const image = await prepImageRepository.createImage(USER, prep.id, `prep-pages/${prep.id}/key`)
  const job = await prisma.job.create({
    data: {
      prepId: prep.id, type: "ocr", status, heartbeatAt, attempts, ...CONFIG, createdBy: USER,
      failureReason: status === "failed" ? "boom" : null,
      inputs: { create: [ { entityType: "prepImage", entityId: image.id } ] },
    },
  })
  return { prep, job }
}

const statusOf = async (id: string) => (await prisma.job.findUniqueOrThrow({ where: { id } })).status

describe("stale heartbeat", () => {
  it("getJob persists `running` with a heartbeat older than 5 min as `interrupted`", async () => {
    const { job } = await makeJob("running", ago(STALE_HEARTBEAT_MS + 1000))

    expect(await store.getJob(USER, job.id)).toMatchObject({ status: "interrupted" })
    expect(await statusOf(job.id)).toBe("interrupted")
  })

  it("leaves a fresh `running` job alone", async () => {
    const { job } = await makeJob("running", ago(60_000))

    expect(await store.getJob(USER, job.id)).toMatchObject({ status: "running" })
    expect(await statusOf(job.id)).toBe("running")
  })

  it("listUnfinishedJobs and interruptStaleJobs persist the transition too", async () => {
    const { prep, job } = await makeJob("running", ago(STALE_HEARTBEAT_MS + 1000))

    expect((await listUnfinishedJobs(USER, prep.id)).map(j => j.id)).toEqual([ job.id ])
    expect(await statusOf(job.id)).toBe("interrupted")

    const second = await makeJob("running", ago(STALE_HEARTBEAT_MS + 1000))
    await interruptStaleJobs({ prepId: second.prep.id })
    expect(await statusOf(second.job.id)).toBe("interrupted")
  })

  it("getPrepProgress is read-only: a stale job stays `running` until swept", async () => {
    const { prep, job } = await makeJob("running", ago(STALE_HEARTBEAT_MS + 1000))

    expect(await getPrepProgress(prep.id)).toMatchObject({ runState: "running" })
    expect(await statusOf(job.id)).toBe("running")
  })
})

describe("running and interrupted jobs", () => {
  it("resumes `interrupted` jobs but not fresh `running` ones", async () => {
    const interrupted = await makeJob("interrupted", null)
    const running = await makeJob("running", new Date())

    expect((await listUnfinishedJobs(USER, interrupted.prep.id)).map(j => j.id)).toEqual([ interrupted.job.id ])
    expect(await listUnfinishedJobs(USER, running.prep.id)).toEqual([])
  })

  it("claimJob takes resumable jobs once and refuses a running one", async () => {
    const { job } = await makeJob("interrupted", null)

    expect(await claimJob(job.id)).toBe(true)
    expect(await statusOf(job.id)).toBe("running")
    expect(await claimJob(job.id)).toBe(false)
  })

  it("commitJob counts a failed attempt, claimJob does not", async () => {
    const { job } = await makeJob("created", null)

    await claimJob(job.id)
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(0)

    await store.commitJob(USER, job.id, "running", { status: "failed", failureReason: "boom", wastedMetas: [] })
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(1)
  })

  it("a job failing MAX_JOB_ATTEMPTS times without claims is terminal", async () => {
    const { job } = await makeJob("created", null)

    await store.commitJob(USER, job.id, "created", { status: "failed", failureReason: "boom", wastedMetas: [] })
    for (let attempt = 2; attempt <= MAX_JOB_ATTEMPTS; attempt++) {
      await store.commitJob(USER, job.id, "failed", { status: "failed", failureReason: "boom", wastedMetas: [] })
    }

    expect(await store.getJob(USER, job.id)).toMatchObject({ status: "failed", terminal: true })
  })

  it("a `failed` job below the cap resumes; at the cap it is terminal for listUnfinishedJobs and claimJob", async () => {
    const retryable = await makeJob("failed", null, MAX_JOB_ATTEMPTS - 1)
    const terminal = await makeJob("failed", null, MAX_JOB_ATTEMPTS)

    expect((await listUnfinishedJobs(USER, retryable.prep.id)).map(j => j.id)).toEqual([ retryable.job.id ])
    expect(await listUnfinishedJobs(USER, terminal.prep.id)).toEqual([])
    expect(await claimJob(terminal.job.id)).toBe(false)
    expect(await statusOf(terminal.job.id)).toBe("failed")
    expect(await store.getJob(USER, terminal.job.id)).toMatchObject({ status: "failed", terminal: true })
    expect(await store.getJob(USER, retryable.job.id)).toMatchObject({ status: "failed", terminal: false })
  })

  it("getPrepProgress separates terminal questions from retryable failed ones", async () => {
    const { prep } = await makeJob("failed", null)
    await prisma.job.updateMany({ where: { prepId: prep.id }, data: { type: "question", attempts: MAX_JOB_ATTEMPTS } })

    expect(await getPrepProgress(prep.id)).toMatchObject({ failedQuestions: 0, terminalQuestions: 1 })
  })

  it("retryTerminalJobs resets terminal jobs for resume and refuses a non-owner", async () => {
    const { prep, job } = await makeJob("failed", null, MAX_JOB_ATTEMPTS)

    await expect(retryTerminalJobs("someone-else", prep.id)).rejects.toThrow()
    expect(await retryTerminalJobs(USER, prep.id)).toBe(1)

    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "interrupted", attempts: 0, failureReason: null })
    expect((await listUnfinishedJobs(USER, prep.id)).map(j => j.id)).toEqual([ job.id ])
  })

  it("retryFailedPages resets only the given pages' OCR jobs and refuses a non-owner", async () => {
    const { prep, job } = await makeJob("failed", null, MAX_JOB_ATTEMPTS)
    const otherImage = await prepImageRepository.createImage(USER, prep.id, `prep-pages/${prep.id}/other`)
    const otherOcr = await prisma.job.create({
      data: { prepId: prep.id, type: "ocr", status: "failed", attempts: MAX_JOB_ATTEMPTS, failureReason: "boom", ...CONFIG, createdBy: USER, inputs: { create: [ { entityType: "prepImage", entityId: otherImage.id } ] } },
    })
    const question = await prisma.job.create({
      data: { prepId: prep.id, type: "question", status: "failed", attempts: MAX_JOB_ATTEMPTS, failureReason: "boom", ...CONFIG, createdBy: USER },
    })
    const imageId = (await prisma.jobInput.findFirstOrThrow({ where: { jobId: job.id } })).entityId

    await expect(retryFailedPages("someone-else", prep.id, [ imageId ])).rejects.toThrow()
    expect(await retryFailedPages(USER, prep.id, [ imageId ])).toBe(1)

    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "interrupted", attempts: 0, failureReason: null })
    expect(await statusOf(otherOcr.id)).toBe("failed")
    expect(await statusOf(question.id)).toBe("failed")
  })

  it("retryJob resets one failed job, resumable or terminal, with a fresh budget", async () => {
    const resumable = await makeJob("failed", null, 1)
    const terminal = await makeJob("failed", null, MAX_JOB_ATTEMPTS)

    await retryJob(USER, resumable.job.id)
    await retryJob(USER, terminal.job.id)

    for (const { job } of [ resumable, terminal ]) {
      expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "interrupted", attempts: 0, failureReason: null })
    }
  })

  it("retryJob refuses a non-owner, a missing job and a job that isn't failed", async () => {
    const failed = await makeJob("failed", null)
    const created = await makeJob("created", null)

    await expect(retryJob("someone-else", failed.job.id)).rejects.toThrow()
    await expect(retryJob(USER, "missing")).rejects.toThrow()
    await expect(retryJob(USER, created.job.id)).rejects.toThrow("not failed")
    expect(await statusOf(failed.job.id)).toBe("failed")
    expect(await statusOf(created.job.id)).toBe("created")
  })

  it("supersedes a failed job: not resumable, not retryable, and out of the prep status", async () => {
    const { prep, job } = await makeJob("failed", null)
    const store = createPrismaStore()

    await store.supersedeJob(USER, job.id)

    expect(await statusOf(job.id)).toBe("superseded")
    expect(await listUnfinishedJobs(USER, prep.id)).toEqual([])
    expect(await claimJob(job.id)).toBe(false)
    await expect(retryJob(USER, job.id)).rejects.toThrow("not failed")
    await expect(store.supersedeJob(USER, job.id)).rejects.toThrow("not failed")
    await expect(store.supersedeJob("someone-else", job.id)).rejects.toThrow()
    expect((await store.getJob(USER, job.id))?.status).toBe("superseded")
  })

  it("commits from `running` over the status the caller read", async () => {
    const { job } = await makeJob("created", null)
    await claimJob(job.id)

    const committed = await store.commitJob(USER, job.id, "created", { status: "failed", failureReason: "boom", wastedMetas: [] })

    expect(committed).toBe(true)
    expect(await statusOf(job.id)).toBe("failed")
  })

  it("hasActiveRun is true only for a fresh heartbeat", async () => {
    const fresh = await makeJob("running", new Date())
    const stale = await makeJob("running", ago(STALE_HEARTBEAT_MS + 1000))

    expect(await hasActiveRun(fresh.prep.id)).toBe(true)
    expect(await hasActiveRun(stale.prep.id)).toBe(false)
  })

  it("markInterrupted only touches `running` jobs", async () => {
    const running = await makeJob("running", new Date())
    const failed = await makeJob("failed", null)

    await markInterrupted([ running.job.id, failed.job.id ])

    expect(await statusOf(running.job.id)).toBe("interrupted")
    expect(await statusOf(failed.job.id)).toBe("failed")
  })
})
