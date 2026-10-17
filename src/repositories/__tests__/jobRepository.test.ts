import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { ExecutionConfig, JobOutcome } from "@/core/job"
import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import { createPrismaStore, listUnfinishedJobs } from "@/repositories/jobRepository"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const META = { model: "gpt-5-nano", tier: "flex", temperature: 1, maxTokens: 32_000, promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }
const FAILED: JobOutcome<unknown> = { status: "failed", failureReason: "boom", wastedMetas: [] }

function executedOcr(text: string): Extract<JobOutcome<unknown>, { status: "executed" }> {
  return { status: "executed", output: { title: "T", text, visual_elements: [], language: "en" }, metas: [ META ], wastedMetas: [] }
}

const store = createPrismaStore()

beforeEach(async () => {
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
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

async function makeConcept(userId: string) {
  const prep = await prepRepository.createPrep(userId, { title: "Prep", language: "en" })
  const conceptsJob = await prisma.job.create({
    data: {
      prepId: prep.id, type: "concepts", status: "executed",
      model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0,
      createdBy: userId, output: [],
    },
  })
  const concept = await prisma.concept.create({
    data: { language: "en", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id },
  })
  return { prep, concept }
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

  it("resolves a Concept input via its producing job's Prep", async () => {
    const { concept } = await makeConcept(OWNER)
    const job = await store.createJob(OWNER, "prep.meta", [ concept.id ], CONFIG)

    expect(job).toMatchObject({ type: "prep.meta", status: "created", inputIds: [ concept.id ] })
  })

  it("rejects an actor who doesn't own a Concept input's Prep", async () => {
    const { concept } = await makeConcept(OWNER)
    await expect(store.createJob(OTHER, "prep.meta", [ concept.id ], CONFIG)).rejects.toThrow(ForbiddenError)
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

  it("resolves Concept ids alongside PrepImage ids, scoped to the actor", async () => {
    const { image } = await makeImage(OWNER)
    const { concept } = await makeConcept(OWNER)
    const { concept: otherConcept } = await makeConcept(OTHER)

    const resolved = await store.existingIds(OWNER, [ image.id, concept.id, otherConcept.id, "does-not-exist" ])
    expect(resolved).toEqual(new Set([ image.id, concept.id ]))
  })
})

describe("commitJob", () => {
  it("persists a question job's content unwrapped, without the type envelope", async () => {
    const { concept } = await makeConcept(OWNER)
    const job = await store.createJob(OWNER, "question", [ concept.id ], CONFIG, { questionType: "flashcard", difficulty: "easy" })
    const content = { front: "f", back: "b", back_explanation: "e", asset_hint: { needed: false, type: null, description: null } }

    await store.commitJob(OWNER, job.id, "created", { status: "executed", output: { type: "flashcard", content }, metas: [ META ], wastedMetas: [] })

    const question = await prisma.question.findFirstOrThrow({ where: { producedByJobId: job.id } })
    expect(question.content).toEqual(content)
  })

  describe("output validation", () => {
    const executed = (output: unknown): Extract<JobOutcome<unknown>, { status: "executed" }> =>
      ({ status: "executed", output, metas: [ META ], wastedMetas: [] })

    it("strips extra prep-meta fields such as visibility and userId", async () => {
      const { prep, image } = await makeImage(OWNER)
      const job = await store.createJob(OWNER, "prep.meta", [ image.id ], CONFIG)
      const output = { title: "T", description: "D", grade: null, discipline: null, visibility: "public", userId: OTHER }

      await store.commitJob(OWNER, job.id, "created", executed(output))

      expect(await prisma.prep.findUniqueOrThrow({ where: { id: prep.id } })).toMatchObject({ visibility: "private", userId: OWNER, title: "T" })
    })

    it("rejects prep-meta output that is out of range", async () => {
      const { image } = await makeImage(OWNER)
      const job = await store.createJob(OWNER, "prep.meta", [ image.id ], CONFIG)

      await expect(store.commitJob(OWNER, job.id, "created", executed({ title: "T", description: "D", grade: 1.5, discipline: "Nope" }))).rejects.toThrow()
      expect((await store.getJob(OWNER, job.id))?.status).toBe("created")
    })

    it("rejects a question whose content does not match its type", async () => {
      const { concept } = await makeConcept(OWNER)
      const job = await store.createJob(OWNER, "question", [ concept.id ], CONFIG, { questionType: "flashcard", difficulty: "easy" })

      await expect(store.commitJob(OWNER, job.id, "created", executed({ type: "flashcard", content: { front: "<script>" } }))).rejects.toThrow()
      expect(await prisma.question.count()).toBe(0)
    })

    it("rejects OCR output without a supported language", async () => {
      const { image } = await makeImage(OWNER)
      const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

      await expect(store.commitJob(OWNER, job.id, "created", executed({ title: "T", text: "x", visual_elements: [], language: "xx" }))).rejects.toThrow()
    })

    it("rejects concepts output with malformed concepts", async () => {
      const { concept } = await makeConcept(OWNER)
      const job = await store.createJob(OWNER, "concepts", [ concept.id ], CONFIG)

      await expect(store.commitJob(OWNER, job.id, "created", executed([ { name: "x", id: "forced" } ]))).rejects.toThrow()
    })
  })

  describe("asset job", () => {
    async function makeAssetJob() {
      const { concept } = await makeConcept(OWNER)
      const prep = await prisma.prep.findFirstOrThrow()
      const question = await prisma.question.create({ data: { prepId: prep.id, type: "flashcard", language: "en", content: {} } })
      const job = await store.createJob(OWNER, "asset", [ question.id ], CONFIG)
      return { question, job, concept }
    }
    const executedAsset = (blob: string): Extract<JobOutcome<unknown>, { status: "executed" }> =>
      ({ status: "executed", output: { type: "formula", blob }, metas: [ META ], wastedMetas: [] })

    it("writes the asset and attributes its cost to the asset job", async () => {
      const { question, job } = await makeAssetJob()

      await store.commitJob(OWNER, job.id, "created", executedAsset("<svg></svg>"))

      expect(await prisma.asset.findMany({ where: { questionId: question.id } })).toMatchObject([ { type: "formula", blob: "<svg></svg>", producedByJobId: job.id } ])
      expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(1)
    })

    it("leaves exactly one asset after a failed attempt is retried", async () => {
      const { question, job } = await makeAssetJob()

      await store.commitJob(OWNER, job.id, "created", FAILED)
      expect(await prisma.asset.count({ where: { questionId: question.id } })).toBe(0)
      await store.commitJob(OWNER, job.id, "failed", executedAsset("<svg></svg>"))

      expect(await prisma.asset.count({ where: { questionId: question.id } })).toBe(1)
    })

    it("writes no asset for an empty blob", async () => {
      const { question, job } = await makeAssetJob()

      await store.commitJob(OWNER, job.id, "created", executedAsset(""))

      expect(await prisma.asset.count({ where: { questionId: question.id } })).toBe(0)
    })
  })

  it("retries a failed job: commits failed, then executed", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const failed = await store.commitJob(OWNER, job.id, "created", FAILED)
    expect(failed).toBe(true)
    expect(await store.getJob(OWNER, job.id)).toMatchObject({ status: "failed", failureReason: "boom", output: null })

    const executed = await store.commitJob(OWNER, job.id, "failed", executedOcr("hi"))
    expect(executed).toBe(true)
    expect(await store.getJob(OWNER, job.id)).toMatchObject({ status: "executed", output: { text: "hi" }, failureReason: null })
  })

  it("marks the image done on an executed ocr job and failed (with error) on a failed one", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    await store.commitJob(OWNER, job.id, "created", FAILED)
    expect(await prisma.prepImage.findUniqueOrThrow({ where: { id: image.id } })).toMatchObject({ status: "failed", error: "boom" })

    await store.commitJob(OWNER, job.id, "failed", executedOcr("hi"))
    expect(await prisma.prepImage.findUniqueOrThrow({ where: { id: image.id } })).toMatchObject({ status: "done", error: null })
  })

  it("commits only the winner of a concurrent race on the same job", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    const [ first, second ] = await Promise.all([
      store.commitJob(OWNER, job.id, "created", executedOcr("A")),
      store.commitJob(OWNER, job.id, "created", executedOcr("B")),
    ])

    expect([ first, second ].filter(Boolean)).toHaveLength(1)
    expect([ first, second ].filter(c => !c)).toHaveLength(1)
    expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(1)
  })

  it("writes no domain rows when it loses the commit race", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    await store.commitJob(OWNER, job.id, "created", executedOcr("winner"))

    const lost = await store.commitJob(OWNER, job.id, "created", { ...executedOcr("loser"), wastedMetas: [ META ] })
    expect(lost).toBe(false)

    const reloaded = await prisma.prepImage.findUniqueOrThrow({ where: { id: image.id } })
    expect(reloaded.ocrResult).toEqual({ title: "T", text: "winner", visual_elements: [] })
    expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(1)
  })

  it("leaves no partial domain rows when the commit fails", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    // The OCR row is written, then the invalid meta fails the transaction.
    const invalidMeta = { ...META, promptTokens: "x" as unknown as number }
    await expect(
      store.commitJob(OWNER, job.id, "created", { ...executedOcr("doomed"), metas: [ invalidMeta ] })
    ).rejects.toThrow()

    expect(await store.getJob(OWNER, job.id)).toMatchObject({ status: "created" })
    const reloaded = await prisma.prepImage.findUniqueOrThrow({ where: { id: image.id } })
    expect(reloaded.ocrResult).toBeNull()
    expect(await prisma.generationMeta.count({ where: { jobId: job.id } })).toBe(0)
  })

  it("persists a failed outcome's wasted metas", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)

    await store.commitJob(OWNER, job.id, "created", { ...FAILED, wastedMetas: [ META ] })

    const metas = await prisma.generationMeta.findMany({ where: { jobId: job.id } })
    expect(metas).toHaveLength(1)
    expect(metas[0].wasted).toBe(true)
  })

  it("lists a prep's created and failed jobs, not executed ones", async () => {
    const { prep, image } = await makeImage(OWNER)
    const created = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    const failed = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    await store.commitJob(OWNER, failed.id, "created", FAILED)
    const executed = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    await store.commitJob(OWNER, executed.id, "created", executedOcr("hi"))

    const jobs = await listUnfinishedJobs(OWNER, prep.id)
    expect(jobs.map(j => j.id).sort()).toEqual([ created.id, failed.id ].sort())
  })

  it("refuses to list a non-owner's unfinished jobs", async () => {
    const { prep } = await makeImage(OWNER)
    await expect(listUnfinishedJobs(OTHER, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it("rejects a non-owner actor", async () => {
    const { image } = await makeImage(OWNER)
    const job = await store.createJob(OWNER, "ocr", [ image.id ], CONFIG)
    await expect(
      store.commitJob(OTHER, job.id, "created", executedOcr("hi"))
    ).rejects.toThrow(ForbiddenError)
  })
})
