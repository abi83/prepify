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
  await prisma.asset.deleteMany()
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
    await prisma.concept.create({ data: { language: "en", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })
    await job("prep.meta")
    await job("question")
    await prisma.question.create({ data: { prepId: finished.id, language: "en", type: "flashcard", difficulty: "easy", content: {} } })

    const other = await prepRepository.createPrep(OTHER, { title: "Other", language: "en" })
    await prepImageRepository.createImage(OTHER, other.id, "key")

    const preps = await listUnfinishedPreps(OWNER, TARGET)
    expect(preps.map(p => p.id)).toEqual([ unfinished.id ])
    expect(await loadPrepState(finished.id)).toMatchObject({ prepMetaDone: true, questionCount: 1, questionJobCount: 1 })
  })

  it("lists questions that need an asset and have neither an asset nor an asset job", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Assets", language: "en" })
    const hint = (needed: boolean) => ({ needed, type: needed ? "formula" : null, description: needed ? "E=mc^2" : null })
    const question = (needed: boolean) => prisma.question.create({ data: { prepId: prep.id, language: "en", type: "flashcard", content: { asset_hint: hint(needed) } } })
    const [ plain, pending, withAsset, withJob ] = await Promise.all([ question(false), question(true), question(true), question(true) ])
    await prisma.asset.create({ data: { questionId: withAsset.id, type: "formula", blob: "<svg></svg>" } })
    await prisma.job.create({
      data: {
        prepId: prep.id, type: "asset", status: "failed", failureReason: "boom", model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER,
        inputs: { create: [ { entityType: "question", entityId: withJob.id } ] },
      },
    })

    const state = await loadPrepState(prep.id)

    expect(state.assetQuestionIds).toEqual([ pending.id ])
    expect(state.assetQuestionIds).not.toContain(plain.id)
  })

  describe("getPrepProgress", () => {
    const addJob = (prepId: string, type: string, status: "created" | "executed" | "failed" | "running" | "interrupted") => prisma.job.create({
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

    it("reports a running or interrupted OCR job even before later jobs exist", async () => {
      const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
      const job = await addJob(prep.id, "ocr", "running")
      await prisma.job.update({ where: { id: job.id }, data: { heartbeatAt: new Date() } })
      expect(await getPrepProgress(prep.id)).toMatchObject({ runState: "running", totalQuestions: 0 })

      await prisma.job.update({ where: { id: job.id }, data: { status: "interrupted" } })
      expect(await getPrepProgress(prep.id)).toMatchObject({ runState: "interrupted" })
    })

    it("counts pages with an OCR result while OCR is running", async () => {
      const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
      const first = await prepImageRepository.createImage(OWNER, prep.id, "k1")
      await prepImageRepository.createImage(OWNER, prep.id, "k2")
      await prisma.prepImage.update({ where: { id: first.id }, data: { ocrResult: { text: "t", visual_elements: [] } } })
      const job = await addJob(prep.id, "ocr", "running")
      await prisma.job.update({ where: { id: job.id }, data: { heartbeatAt: new Date() } })

      expect(await getPrepProgress(prep.id)).toMatchObject({ runState: "running", totalPages: 2, ocrPages: 1 })
    })

    it("counts question jobs by status and reports whether concepts exist", async () => {
      const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
      const conceptsJob = await addJob(prep.id, "concepts", "executed")
      await prisma.concept.create({ data: { language: "en", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })
      await addJob(prep.id, "question", "executed")
      await addJob(prep.id, "question", "executed")
      await addJob(prep.id, "question", "failed")
      await addJob(prep.id, "question", "created")

      expect(await getPrepProgress(prep.id)).toEqual({ runState: "idle", totalPages: 0, ocrPages: 0, hasConcepts: true, totalQuestions: 4, completedQuestions: 2, failedQuestions: 1 })
    })
  })
})
