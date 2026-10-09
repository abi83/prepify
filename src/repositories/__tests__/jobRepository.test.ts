import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { ExecutionConfig } from "@/core/job"
import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import { createPrismaStore } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const store = createPrismaStore()

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.generationMeta.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

async function makeImage(userId: string) {
  const prep = await prepRepository.createPrep(userId, { title: "Prep", language: "en" })
  const image = await prepImageRepository.createImage(userId, prep.id, "key")
  return { prep, image }
}

describe("createJob", () => {
  it("creates a job owned by the actor, with its inputs recorded", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    expect(job).toMatchObject({ type: "ocr", status: "created", inputIds: [ image.id ], config: CONFIG, output: null, failureReason: null })
  })

  it("rejects an actor who doesn't own the input's Prep", async () => {
    const { image } = await makeImage(OWNER)
    await expect(store.createJob(OTHER, "ocr", [ image.id ], CONFIG)).rejects.toThrow(ForbiddenError)
  })

  it("rejects an input id that doesn't resolve to any known entity", async () => {
    await expect(store.createJob(OWNER, "ocr", [ "does-not-exist" ], CONFIG)).rejects.toThrow(NotFoundError)
  })
})

describe("getJob", () => {
  it("returns null for a job that doesn't exist", async () => {
    expect(await store.getJob(OWNER, "does-not-exist")).toBeNull()
  })

  it("rejects a non-owner actor", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    await expect(store.getJob(OTHER, job.id)).rejects.toThrow(ForbiddenError)
  })
})

describe("existingIds", () => {
  it("resolves only the ids that exist and are owned by the actor", async () => {
    const { image } = await makeImage(OWNER)
    const { image: otherImage } = await makeImage(OTHER)

    const resolved = await store.existingIds(OWNER, [ image.id, otherImage.id, "does-not-exist" ])
    expect(resolved).toEqual(new Set([ image.id ]))
  })
})

describe("commitJob", () => {
  it("retries a failed job: commits failed, then executed", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const failed = await store.commitJob(OWNER, job.id, "created", { status: "failed", failureReason: "boom" })
    expect(failed).toBe(true)
    expect(await store.getJob(OWNER, job.id)).toMatchObject({ status: "failed", failureReason: "boom", output: null })

    const executed = await store.commitJob(OWNER, job.id, "failed", { status: "executed", output: "hi" })
    expect(executed).toBe(true)
    expect(await store.getJob(OWNER, job.id)).toMatchObject({ status: "executed", output: "hi", failureReason: null })
  })

  it("commits only the winner of a concurrent race on the same job", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const [ first, second ] = await Promise.all([
      store.commitJob(OWNER, job.id, "created", { status: "executed", output: "A" }),
      store.commitJob(OWNER, job.id, "created", { status: "executed", output: "B" }),
    ])

    expect([ first, second ].filter(Boolean)).toHaveLength(1)
    expect([ first, second ].filter(c => !c)).toHaveLength(1)
  })

  it("rejects a non-owner actor", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    await expect(
      store.commitJob(OTHER, job.id, "created", { status: "executed", output: "hi" })
    ).rejects.toThrow(ForbiddenError)
  })
})
