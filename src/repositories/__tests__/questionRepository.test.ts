import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import { prisma } from "@/lib/prisma"
import { ForbiddenError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"
import * as questionRepository from "@/repositories/questionRepository"

const OWNER = "user-owner"

beforeEach(async () => {
  await prisma.attempt.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
  await prisma.prep.deleteMany()
})

describe("listByPrep", () => {
  it("is visible to the owner", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    await prisma.question.create({ data: { prepId: prep.id, type: "flashcard", difficulty: "easy", content: {} } })
    const questions = await questionRepository.listByPrep(OWNER, prep.id)
    expect(questions).toHaveLength(1)
  })

  it("rejects an anonymous reader when the parent prep is private", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    await expect(questionRepository.listByPrep(null, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it("is visible to anyone when the parent prep is public", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    await prepRepository.updatePrep(OWNER, prep.id, { visibility: "public" })
    await prisma.question.create({ data: { prepId: prep.id, type: "flashcard", difficulty: "easy", content: {} } })

    const questions = await questionRepository.listByPrep(null, prep.id)
    expect(questions).toHaveLength(1)
  })
})
