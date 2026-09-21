import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../lib/prisma", async () => {
  const { createPglitePrisma } = await import("../../test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import type { AgentMeta } from "../../lib/agent"
import { prisma } from "../../lib/prisma"
import { ForbiddenError } from "../errors"
import * as prepRepository from "../prepRepository"
import * as questionRepository from "../questionRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

function meta(overrides: Partial<AgentMeta> = {}): AgentMeta {
  return {
    model: "gpt-5-nano",
    tier: "flex",
    promptTokens: 100,
    cachedTokens: 0,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.0003,
    toolCalls: 0,
    executionMs: 500,
    ...overrides,
  }
}

beforeEach(async () => {
  await prisma.generationMeta.deleteMany()
  await prisma.attempt.deleteMany()
  await prisma.pipelineQuestion.deleteMany()
  await prisma.pipelineRun.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
  await prisma.prep.deleteMany()
})

describe("insertMany", () => {
  it("lets the owner insert questions", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const saved = await questionRepository.insertMany(OWNER, prep.id, [
      { type: "flashcard", difficulty: "easy", content: { front: "a", back: "b" } },
    ])
    expect(saved).toHaveLength(1)
    expect(saved[0].prepId).toBe(prep.id)
    expect(saved[0].difficulty).toBe("easy")
  })

  it("rejects a non-owner inserting questions", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    await expect(
      questionRepository.insertMany(OTHER, prep.id, [ { type: "flashcard", difficulty: "easy", content: {} } ])
    ).rejects.toThrow(ForbiddenError)
  })

  it("fails fast when questionMeta length doesn't match questions length", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    await expect(
      questionRepository.insertMany(
        OWNER,
        prep.id,
        [ { type: "flashcard", difficulty: "easy", content: {} }, { type: "flashcard", difficulty: "easy", content: {} } ],
        [ [] ],
      )
    ).rejects.toThrow(/questionMeta length/)
  })

  it("records a GenerationMeta row per meta, against the newly created question's id", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const saved = await questionRepository.insertMany(
      OWNER,
      prep.id,
      [
        { type: "flashcard", difficulty: "easy", content: { front: "a", back: "b" } },
        { type: "single_choice", difficulty: "hard", content: {} },
      ],
      [
        [ meta({ model: "gpt-5-nano" }), meta({ model: "gpt-5-nano" }) ], // build + review
        [ meta({ model: "gpt-5-mini" }) ], // build only
      ],
    )

    expect(saved).toHaveLength(2)

    const firstMetas = await prisma.generationMeta.findMany({ where: { entityType: "question", entityId: saved[0].id } })
    const secondMetas = await prisma.generationMeta.findMany({ where: { entityType: "question", entityId: saved[1].id } })
    expect(firstMetas).toHaveLength(2)
    expect(secondMetas).toHaveLength(1)
    expect(secondMetas[0].model).toBe("gpt-5-mini")
  })

  it("skips recording a GenerationMeta row for a meta with no tokens", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    const saved = await questionRepository.insertMany(
      OWNER,
      prep.id,
      [ { type: "flashcard", difficulty: "easy", content: {} } ],
      [ [ meta({ promptTokens: 0, cachedTokens: 0, completionTokens: 0 }) ] ],
    )

    const metas = await prisma.generationMeta.findMany({ where: { entityType: "question", entityId: saved[0].id } })
    expect(metas).toHaveLength(0)
  })
})

describe("listByPrep", () => {
  it("is visible to the owner", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    await questionRepository.insertMany(OWNER, prep.id, [ { type: "flashcard", difficulty: "easy", content: {} } ])
    const questions = await questionRepository.listByPrep(OWNER, prep.id)
    expect(questions).toHaveLength(1)
  })

  it("rejects an anonymous reader when the parent prep is private", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    await expect(questionRepository.listByPrep(null, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it("is visible to anyone when the parent prep is public", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", pages: [], language: "en" })
    await prepRepository.updatePrep(OWNER, prep.id, { visibility: "public" })
    await questionRepository.insertMany(OWNER, prep.id, [ { type: "flashcard", difficulty: "easy", content: {} } ])

    const questions = await questionRepository.listByPrep(null, prep.id)
    expect(questions).toHaveLength(1)
  })
})
