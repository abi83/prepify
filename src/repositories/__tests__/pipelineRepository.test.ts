import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", async () => {
  const { createPglitePrisma } = await import("../../test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { AgentMeta } from "../../lib/agent"
import type { Review } from "../../lib/agents/QuestionReviewer"
import { prisma } from "../../lib/prisma"
import type { Concept, QuestionTask } from "../../types/pipeline"
import type { GeneratedQuestion } from "../../types/questions"
import { ForbiddenError } from "../errors"
import * as pipelineRepository from "../pipelineRepository"
import * as prepRepository from "../prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

const concept: Concept = { name: "Concept", description: "x".repeat(40), importance: 0.5, misconceptions: [] }
const task: QuestionTask = { concepts: [ concept ], type: "flashcard", difficulty: "easy" }

function meta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return { model: "test-model", tier: "flash", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.01, toolCalls: 0, executionMs: 100, ...overrides }
}

function flashcard(front: string): GeneratedQuestion {
  return { type: "flashcard", content: { front, back: "A", back_explanation: "", asset_hint: { needed: false, type: null, description: null } } }
}

function review(passed: boolean): Review {
  const metric = { score: passed ? 1 : 0.5, comment: "c" }
  return { scores: { correctness: metric, conceptAlignment: metric, clarity: metric, cognitiveDemand: metric, distractorQuality: null }, comment: "overall" }
}

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
