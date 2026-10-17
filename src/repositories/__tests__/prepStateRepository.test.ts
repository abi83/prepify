import type { JobStatus } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import { prisma } from "@/lib/prisma"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"
import { getPrepProgress, loadPrepState, loadRejectedPageGenerations } from "@/repositories/prepStateRepository"

const OWNER = "user-owner"

const addMeta = (jobId: string, wasted = false) => prisma.generationMeta.create({
  data: { jobId, model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, costUsd: 0.001, toolCalls: 0, executionMs: 100, wasted },
})

beforeEach(async () => {
  await prisma.generationMeta.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.jobInput.deleteMany()
  await prisma.question.deleteMany()
  await prisma.concept.deleteMany()
  await prisma.job.deleteMany()
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

describe("prepStateRepository", () => {
  it("loads the state of a fully generated prep", async () => {
    const finished = await prepRepository.createPrep(OWNER, { title: "Finished", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, finished.id, `prep-pages/${finished.id}/key`)
    await prisma.prepImage.update({ where: { id: image.id }, data: { ocrResult: { title: "T", text: "t", visual_elements: [] } } })
    const job = (type: string, output: object = []) => prisma.job.create({
      data: {
        prepId: finished.id, type, status: "executed", model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER, output,
        inputs: { create: [ { entityType: "prepImage", entityId: image.id } ] },
      },
    })
    const extracted = { name: "Mitosis", description: "Cell division process in eukaryotes that yields two identical cells", importance: 0.9, misconceptions: [], language: "en" }
    await job("concepts.extract", { status: "found", concepts: [ extracted ] })
    const conceptsJob = await job("concepts")
    await prisma.concept.create({ data: { language: "en", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })
    await addMeta(conceptsJob.id)
    await job("prep.meta")
    await job("question")
    await prisma.question.create({ data: { prepId: finished.id, language: "en", type: "flashcard", difficulty: "easy", content: {} } })

    expect(await loadPrepState(finished.id)).toMatchObject({ prepMetaDone: true, questionCount: 1, questionJobCount: 1, images: [ { id: image.id, merge: "merged" } ] })
  })

  it("derives each page's merge state from its concepts jobs: none, planned or merged", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Merges", language: "en" })
    const [ none, planned, merged ] = await Promise.all([ "k1", "k2", "k3" ].map(key => prepImageRepository.createImage(OWNER, prep.id, `prep-pages/${prep.id}/${key}`)))
    const mergeJob = (status: "created" | "executed", imageId: string) => prisma.job.create({
      data: {
        prepId: prep.id, type: "concepts", status, model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER,
        ...(status === "executed" ? { output: [] } : {}),
        inputs: { create: [ { entityType: "prepImage", entityId: imageId } ] },
      },
    })
    await mergeJob("created", planned.id)
    await mergeJob("executed", merged.id)

    const { images } = await loadPrepState(prep.id)

    expect(images.map(image => [ image.id, image.merge ])).toEqual([ [ none.id, "none" ], [ planned.id, "planned" ], [ merged.id, "merged" ] ])
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

  it("loads each concept with its job's generation calls, wasted ones included", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Concepts", language: "en" })
    const conceptsJob = await prisma.job.create({
      data: { prepId: prep.id, type: "concepts", status: "executed", model: "gpt-5-nano", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER, output: [] },
    })
    await prisma.concept.create({ data: { language: "en", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })
    await addMeta(conceptsJob.id)
    await addMeta(conceptsJob.id, true)

    const { concepts } = await loadPrepState(prep.id)

    expect(concepts).toHaveLength(1)
    expect(concepts[0].generation).toMatchObject({ jobId: conceptsJob.id, model: "gpt-5-nano", tier: "flex" })
    expect(concepts[0].generation.calls.map(call => call.wasted).sort()).toEqual([ false, true ])
  })

  it("gives a concept whose job made no LLM call an empty call list", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "No meta", language: "en" })
    const conceptsJob = await prisma.job.create({
      data: { prepId: prep.id, type: "concepts", status: "executed", model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER, output: [] },
    })
    await prisma.concept.create({ data: { language: "en", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], producedByJobId: conceptsJob.id } })

    const { concepts } = await loadPrepState(prep.id)

    expect(concepts[0].generation.calls).toEqual([])
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
      const first = await prepImageRepository.createImage(OWNER, prep.id, `prep-pages/${prep.id}/k1`)
      await prepImageRepository.createImage(OWNER, prep.id, `prep-pages/${prep.id}/k2`)
      await prisma.prepImage.update({ where: { id: first.id }, data: { ocrResult: { title: "T", text: "t", visual_elements: [] } } })
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

      expect(await getPrepProgress(prep.id)).toEqual({ runState: "idle", totalPages: 0, ocrPages: 0, rejectedPages: 0, hasConcepts: true, totalQuestions: 4, completedQuestions: 2, failedQuestions: 1, terminalQuestions: 0, totalFlashcards: 0, completedFlashcards: 0, failedFlashcards: 0, terminalFlashcards: 0 })
    })

    it("counts flashcard jobs separately from quiz question jobs", async () => {
      const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
      const addQuestionJob = (questionType: string, status: JobStatus) => prisma.job.create({
        data: { prepId: prep.id, type: "question", questionType, difficulty: "easy", status, model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER, ...(status === "executed" ? { output: [] } : {}), ...(status === "failed" ? { failureReason: "boom" } : {}) },
      })
      await addQuestionJob("single_choice", "executed")
      await addQuestionJob("flashcard", "executed")
      await addQuestionJob("flashcard", "failed")

      expect(await getPrepProgress(prep.id)).toMatchObject({ totalQuestions: 1, completedQuestions: 1, failedQuestions: 0, totalFlashcards: 2, completedFlashcards: 1, failedFlashcards: 1 })
    })
  })

  it("keys a rejected page's wasted OCR calls by image id, one job accumulating retries", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "P", language: "en" })
    const [ rejected, clean ] = await Promise.all([ "a", "b" ].map(key => prepImageRepository.createImage(OWNER, prep.id, `prep-pages/${prep.id}/${key}`)))
    const ocrJob = (imageId: string) => prisma.job.create({
      data: { prepId: prep.id, type: "ocr", status: "failed", model: "m", tier: "flex", timeoutMs: 1, maxRetries: 0, createdBy: OWNER, inputs: { create: [ { entityType: "prepImage", entityId: imageId } ] } },
    })
    const wastedJob = await ocrJob(rejected.id)
    await addMeta(wastedJob.id, true)
    await addMeta(wastedJob.id, true)
    await addMeta((await ocrJob(clean.id)).id)

    const generations = await loadRejectedPageGenerations(prep.id)
    expect(Object.keys(generations)).toEqual([ rejected.id ])
    expect(generations[rejected.id]).toMatchObject({ jobId: wastedJob.id, calls: [ { wasted: true }, { wasted: true } ] })
  })
})
