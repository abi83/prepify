import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { Job } from "@/core/job"
import { HEARTBEAT_INTERVAL_MS, trackServerRun } from "@/lib/jobs/server/runTracker"
import { prisma } from "@/lib/prisma"
import * as prepRepository from "@/repositories/prepRepository"

const CONFIG = { model: "m", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

beforeEach(async () => {
  await prisma.job.deleteMany()
  await prisma.prep.deleteMany()
})
afterEach(() => vi.useRealTimers())

async function makeJob(): Promise<Job> {
  const prep = await prepRepository.createPrep("u1", { title: "Prep", language: "en" })
  const row = await prisma.job.create({ data: { prepId: prep.id, type: "ocr", ...CONFIG, createdBy: "u1" } })
  return { id: row.id, type: "ocr", status: "created", inputIds: [], config: CONFIG, question: null, output: null, failureReason: null }
}

const rowOf = (id: string) => prisma.job.findUniqueOrThrow({ where: { id } })
const never = () => new Promise<never>(() => {})

describe("trackServerRun", () => {
  it("marks the job running with a heartbeat while it runs", async () => {
    const job = await makeJob()

    await trackServerRun(job, async () => {
      const row = await rowOf(job.id)
      expect(row.status).toBe("running")
      expect(row.heartbeatAt).not.toBeNull()
    })
  })

  it("refreshes the heartbeat about every 30s", async () => {
    const job = await makeJob()
    vi.useFakeTimers({ toFake: [ "setInterval", "clearInterval" ] })

    let finish!: () => void
    const tracked = trackServerRun(job, () => new Promise<void>(resolve => { finish = resolve }))
    await vi.waitFor(async () => expect((await rowOf(job.id)).status).toBe("running"))
    await prisma.job.update({ where: { id: job.id }, data: { heartbeatAt: new Date(0) } })

    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS)
    await vi.waitFor(async () => expect((await rowOf(job.id)).heartbeatAt!.getTime()).toBeGreaterThan(0))

    finish()
    await tracked
  })

  it("refuses a job another runner holds, without running it", async () => {
    const job = await makeJob()
    await prisma.job.update({ where: { id: job.id }, data: { status: "running", heartbeatAt: new Date() } })
    const run = vi.fn()

    await expect(trackServerRun(job, run)).rejects.toMatchObject({ name: "AbortError" })
    expect(run).not.toHaveBeenCalled()
  })
})

describe("SIGTERM", () => {
  /** A fresh module graph, so the handler installs after the spy is set. */
  async function freshTracker() {
    vi.resetModules()
    const onSpy = vi.spyOn(process, "on")
    const tracker = await import("@/lib/jobs/server/runTracker")
    const { prisma: db } = await import("@/lib/prisma")
    const makeRunning = async (status: "created" | "running") => {
      const prep = await db.prep.create({ data: { userId: "u1", title: "Prep", language: "en" } })
      const row = await db.job.create({ data: { prepId: prep.id, type: "ocr", status, heartbeatAt: status === "running" ? new Date() : null, ...CONFIG, createdBy: "u1" } })
      return { id: row.id, type: "ocr", status: "created", inputIds: [], config: CONFIG, question: null, output: null, failureReason: null } satisfies Job
    }
    return { tracker, db, onSpy, makeRunning }
  }

  it("marks this process's running jobs interrupted, and no others", async () => {
    const { tracker, db, onSpy, makeRunning } = await freshTracker()
    const mine = await makeRunning("created")
    const theirs = await makeRunning("running")

    void tracker.trackServerRun(mine, never)
    await vi.waitFor(async () => expect((await db.job.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("running"))

    const sigterm = onSpy.mock.calls.find(([ event ]) => event === "SIGTERM")
    expect(sigterm).toBeDefined()
    sigterm![1]("SIGTERM")

    await vi.waitFor(async () => expect((await db.job.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("interrupted"))
    expect((await db.job.findUniqueOrThrow({ where: { id: theirs.id } })).status).toBe("running")
    onSpy.mockRestore()
  })

  it("leaves jobs that already committed", async () => {
    const { tracker, db, onSpy, makeRunning } = await freshTracker()
    const job = await makeRunning("created")
    await tracker.trackServerRun(job, async () => {
      await db.job.update({ where: { id: job.id }, data: { status: "executed", output: [] } })
    })

    await tracker.interruptActiveJobs()

    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("executed")
    onSpy.mockRestore()
  })
})
