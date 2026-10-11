import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { PlanTarget } from "@/lib/planner"
import { prisma } from "@/lib/prisma"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { getPrepProgress, listUnfinishedPreps, loadPrepState } from "@/repositories/prepStateRepository"

const OWNER = "user-owner"
const OTHER = "user-other"
const TARGET: PlanTarget = { questionCount: 1, enabledTypes: [ "flashcard" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } }

beforeEach(async () => {
  await prisma.jobInput.deleteMany()
  await prisma.question.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

describe("prepStateRepository", () => {
  it("lists owned preps that still need jobs, skipping finished and other users' preps", async () => {
    const unfinished = await prepRepository.createPrep(OWNER, { title: "Unfinished", language: "en" })
    await prepImageRepository.createImage(OWNER, unfinished.id, "key")

    const finished = await prepRepository.createPrep(OWNER, { title: "Finished", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, finished.id, "key")
    await prisma.prepImage.update({ where: { id: image.id }, data: { ocrResult: { text: "t", visual_elements: [] } } })
    const job = (type: string) => prisma.job.create({
      data: { prepId: finished.id, type, status: "executed", model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER, output: [] },
    })
    const conceptsJob = await job("concepts")
    await prisma.concept.create({ data: { name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })
    await job("prep.meta")
    await prisma.question.create({ data: { prepId: finished.id, type: "flashcard", difficulty: "easy", content: {} } })

    const other = await prepRepository.createPrep(OTHER, { title: "Other", language: "en" })
    await prepImageRepository.createImage(OTHER, other.id, "key")

    const preps = await listUnfinishedPreps(OWNER, TARGET)
    expect(preps.map(p => p.id)).toEqual([ unfinished.id ])
    expect(await loadPrepState(finished.id)).toMatchObject({ prepMetaDone: true, questionCount: 1 })
  })

  describe("getPrepProgress", () => {
    const addJob = (prepId: string, type: string, status: "created" | "executed" | "failed") => prisma.job.create({
      data: {
        prepId, type, status, model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER,
        ...(status === "executed" ? { output: [] } : {}),
        ...(status === "failed" ? { failureReason: "boom" } : {}),
      },
    })

    it("is null while only OCR jobs exist", async () => {
      const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
      await addJob(prep.id, "ocr", "executed")
      expect(await getPrepProgress(prep.id)).toBeNull()
    })

    it("counts question jobs by status and reports whether concepts exist", async () => {
      const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
      const conceptsJob = await addJob(prep.id, "concepts", "executed")
      await prisma.concept.create({ data: { name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })
      await addJob(prep.id, "question", "executed")
      await addJob(prep.id, "question", "executed")
      await addJob(prep.id, "question", "failed")
      await addJob(prep.id, "question", "created")

      expect(await getPrepProgress(prep.id)).toEqual({ hasConcepts: true, totalQuestions: 4, completedQuestions: 2, failedQuestions: 1 })
    })
  })
})
