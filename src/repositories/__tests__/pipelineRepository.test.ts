import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import { concept, flashcard, meta, review, task } from "@/lib/__tests__/pipelineFixtures"
import { prisma } from "@/lib/prisma"
import { ForbiddenError } from "@/repositories/errors"
import * as pipelineRepository from "@/repositories/pipelineRepository"
import * as prepRepository from "@/repositories/prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

beforeEach(async () => {
  await prisma.attempt.deleteMany()
  await prisma.pipelineQuestion.deleteMany()
  await prisma.pipelineRun.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
  await prisma.prep.deleteMany()
})

describe("loadOrCreateRun", () => {
  it("creates a run for the owner and reuses it on a second call", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const first = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    const second = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    expect(second.runId).toBe(first.runId)
  })

  it("rejects a non-owner, even when the prep is shared", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    await prepRepository.updatePrep(OWNER, prep.id, { visibility: "public" })
    await expect(pipelineRepository.loadOrCreateRun(OTHER, prep.id)).rejects.toThrow(ForbiddenError)
  })
})

describe("run progression", () => {
  it("saves concepts, tasks, and a finished slot, then summarizes progress", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)

    await pipelineRepository.saveConcepts(OWNER, runId, [ concept ])
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task, task ])

    let summary = await pipelineRepository.getExistingRunSummary(OWNER, prep.id)
    expect(summary).toEqual({ hasConcepts: true, totalTasks: 2, completedSlots: 0, failedSlots: 0 })

    const question = flashcard("Q")
    await pipelineRepository.finishSlot(OWNER, runId, 0, question, [ meta() ])

    summary = await pipelineRepository.getExistingRunSummary(OWNER, prep.id)
    expect(summary?.completedSlots).toBe(1)

    const reloaded = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    expect(reloaded.concepts).toEqual([ concept ])
    expect(reloaded.slots.get(0)).toEqual({ status: "finished", attempts: [], question, meta: [ meta() ] })
    expect(reloaded.slots.get(1)).toEqual({ status: "pending", attempts: [], question: null, meta: null })
  })

  it("resumes a slot at the first missing step: build persisted but not reviewed", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])

    const built = flashcard("built")
    await pipelineRepository.saveAttemptBuild(OWNER, runId, 0, 1, built, meta())

    const reloaded = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    expect(reloaded.slots.get(0)).toEqual({
      status: "pending",
      attempts: [ { attemptNum: 1, build: { question: built, meta: meta() }, review: null } ],
      question: null,
      meta: null,
    })
  })

  it("resumes a rejected attempt into a second, rewritten attempt", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])

    const rejected = flashcard("rejected")
    await pipelineRepository.saveAttemptBuild(OWNER, runId, 0, 1, rejected, meta())
    await pipelineRepository.saveAttemptReview(OWNER, runId, 0, 1, review(false), false, meta())

    const rewritten = flashcard("rewritten")
    await pipelineRepository.saveAttemptBuild(OWNER, runId, 0, 2, rewritten, meta())

    const reloaded = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    const attempts = reloaded.slots.get(0)?.attempts
    expect(attempts).toHaveLength(2)
    expect(attempts?.[0].review?.passed).toBe(false)
    expect(attempts?.[1].build.question).toEqual(rewritten)
    expect(attempts?.[1].review).toBeNull()
  })

  it("marks a slot failed — terminal, excluded from completedSlots", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])

    await pipelineRepository.failSlot(OWNER, runId, 0)

    const summary = await pipelineRepository.getExistingRunSummary(OWNER, prep.id)
    expect(summary).toEqual({ hasConcepts: false, totalTasks: 1, completedSlots: 0, failedSlots: 1 })

    const reloaded = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    expect(reloaded.slots.get(0)?.status).toBe("failed")
  })

  it("rejects saving a second build for an attempt that already has one", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])
    await pipelineRepository.saveAttemptBuild(OWNER, runId, 0, 1, flashcard("a"), meta())

    await expect(pipelineRepository.saveAttemptBuild(OWNER, runId, 0, 1, flashcard("b"), meta())).rejects.toThrow()
  })

  it("rejects saving a second review for an attempt that already has one", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])
    await pipelineRepository.saveAttemptBuild(OWNER, runId, 0, 1, flashcard("a"), meta())
    await pipelineRepository.saveAttemptReview(OWNER, runId, 0, 1, review(false), false, meta())

    await expect(pipelineRepository.saveAttemptReview(OWNER, runId, 0, 1, review(true), true, meta())).rejects.toThrow()
  })
})

describe("loadOrCreateRun data integrity", () => {
  it("throws instead of silently returning a contentless question for a finished row with a null question", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])
    // Simulate corrupt data a normal write path here can't produce (buggy migration, direct DB write).
    await prisma.pipelineQuestion.update({ where: { runId_taskIndex: { runId, taskIndex: 0 } }, data: { status: "finished" } })

    await expect(pipelineRepository.loadOrCreateRun(OWNER, prep.id)).rejects.toThrow(/finished but has no question/)
  })
})

describe("deleteRun", () => {
  it("removes the run and cascades its question slots", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const { runId } = await pipelineRepository.loadOrCreateRun(OWNER, prep.id)
    await pipelineRepository.saveQuestionTasksAndInitSlots(OWNER, runId, [ task ])

    await pipelineRepository.deleteRun(OWNER, prep.id)

    expect(await prisma.pipelineRun.findUnique({ where: { id: runId } })).toBeNull()
    expect(await prisma.pipelineQuestion.findMany({ where: { runId } })).toHaveLength(0)
    expect(await pipelineRepository.getExistingRunSummary(OWNER, prep.id)).toBeNull()
  })
})
