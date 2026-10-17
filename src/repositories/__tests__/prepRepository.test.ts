import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

beforeEach(async () => {
  await prisma.attempt.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.question.deleteMany()
  await prisma.prep.deleteMany()
})

describe("createPrep / getPrep", () => {
  it("lets the owner read their own private prep", async () => {
    const created = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    const found = await prepRepository.getPrep(OWNER, created.id)
    expect(found.id).toBe(created.id)
  })

  it("rejects a non-owner reading a private prep", async () => {
    const created = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    await expect(prepRepository.getPrep(OTHER, created.id)).rejects.toThrow(ForbiddenError)
  })

  it("rejects an anonymous reader on a private prep", async () => {
    const created = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    await expect(prepRepository.getPrep(null, created.id)).rejects.toThrow(ForbiddenError)
  })

  it("lets anyone read a public prep", async () => {
    const created = await prepRepository.createPrep(OWNER, { title: "Shared Prep", language: "en" })
    await prepRepository.updatePrep(OWNER, created.id, { visibility: "public" })

    const asOther = await prepRepository.getPrep(OTHER, created.id)
    const asAnon = await prepRepository.getPrep(null, created.id)
    expect(asOther.id).toBe(created.id)
    expect(asAnon.id).toBe(created.id)
  })

  it("throws NotFoundError for a missing prep", async () => {
    await expect(prepRepository.getPrep(OWNER, "does-not-exist")).rejects.toThrow(NotFoundError)
  })
})

describe("updatePrep / deletePrep", () => {
  it("rejects updates from a non-owner", async () => {
    const created = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    await expect(prepRepository.updatePrep(OTHER, created.id, { title: "Hijacked" })).rejects.toThrow(ForbiddenError)
  })

  it("rejects deletes from a non-owner and allows the owner to delete", async () => {
    const created = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    await expect(prepRepository.deletePrep(OTHER, created.id)).rejects.toThrow(ForbiddenError)
    await prepRepository.deletePrep(OWNER, created.id)
    await expect(prepRepository.getPrep(OWNER, created.id)).rejects.toThrow(NotFoundError)
  })
})

describe("listOwnedPreps", () => {
  it("only returns the given user's active preps", async () => {
    const active = await prepRepository.createPrep(OWNER, { title: "Owner Prep", language: "en" })
    await prepRepository.createPrep(OWNER, { title: "Draft Prep", language: "en" })
    await prepRepository.createPrep(OTHER, { title: "Other Prep", language: "en" })
    await prisma.prep.update({ where: { id: active.id }, data: { isActive: true } })

    const owned = await prepRepository.listOwnedPreps(OWNER)
    expect(owned).toHaveLength(1)
    expect(owned[0].title).toBe("Owner Prep")
  })
})

describe("listPublicCatalog", () => {
  it("includes only active public preps, with quiz question counts (flashcards excluded)", async () => {
    const priv = await prepRepository.createPrep(OWNER, { title: "Private", language: "en" })
    const pub = await prepRepository.createPrep(OWNER, { title: "Public", language: "en" })
    await prepRepository.updatePrep(OWNER, pub.id, { visibility: "public" })
    await prisma.prep.update({ where: { id: pub.id }, data: { isActive: true } })
    await prisma.question.createMany({
      data: [
        { prepId: pub.id, language: "en", type: "single_choice", content: {} },
        { prepId: pub.id, language: "en", type: "single_choice", content: {} },
        { prepId: pub.id, language: "en", type: "flashcard", content: {} },
      ],
    })

    const catalog = await prepRepository.listPublicCatalog()
    expect(catalog.map(e => e.id)).toContain(pub.id)
    expect(catalog.map(e => e.id)).not.toContain(priv.id)
    const entry = catalog.find(e => e.id === pub.id)
    expect(entry?.questionCount).toBe(2)
    expect(entry?.flashcardCount).toBe(1)
  })

  it("counts concepts through the producing job's prep, 0 for a prep without content", async () => {
    const withConcepts = await prepRepository.createPrep(OWNER, { title: "With", language: "en" })
    const empty = await prepRepository.createPrep(OWNER, { title: "Empty", language: "en" })
    const job = await prisma.job.create({
      data: { prepId: withConcepts.id, type: "concept", model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0, createdBy: OWNER },
    })
    await prisma.concept.createMany({
      data: [
        { name: "A", description: "a", importance: 1, misconceptions: [], language: "en", producedByJobId: job.id },
        { name: "B", description: "b", importance: 1, misconceptions: [], language: "en", producedByJobId: job.id },
      ],
    })
    await prisma.prep.updateMany({ where: { userId: OWNER }, data: { isActive: true } })

    const owned = await prepRepository.listOwnedPreps(OWNER)
    expect(owned.find(e => e.id === withConcepts.id)?.conceptCount).toBe(2)
    expect(owned.find(e => e.id === empty.id)).toMatchObject({ questionCount: 0, flashcardCount: 0, conceptCount: 0 })
  })
})

async function addJobCall(prepId: string, promptTokens: number, completionTokens: number, wasted = false, costUsd = 0): Promise<void> {
  const job = await prisma.job.create({
    data: { prepId, type: "question", model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0, createdBy: OWNER },
  })
  await prisma.generationMeta.create({
    data: { jobId: job.id, model: "gpt-5-nano", tier: "flex", promptTokens, cachedTokens: 0, completionTokens, costUsd, toolCalls: 0, executionMs: 1, wasted },
  })
}

describe("token totals", () => {
  it("sums prompt and completion tokens over a prep's jobs, wasted calls included", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    const other = await prepRepository.createPrep(OWNER, { title: "Other", language: "en" })
    await addJobCall(prep.id, 100, 50)
    await addJobCall(prep.id, 10, 5, true)
    await addJobCall(other.id, 1000, 1000)

    expect(await prepRepository.getPrepTokens(OWNER, prep.id)).toBe(165)
  })

  it("is zero for a prep with no jobs", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    expect(await prepRepository.getPrepTokens(OWNER, prep.id)).toBe(0)
  })

  it("rejects a non-owner reading a private prep's total", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    await expect(prepRepository.getPrepTokens(OTHER, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it("totals only the owner's active preps", async () => {
    const active = await prepRepository.createPrep(OWNER, { title: "Active", language: "en" })
    const draft = await prepRepository.createPrep(OWNER, { title: "Draft", language: "en" })
    const theirs = await prepRepository.createPrep(OTHER, { title: "Theirs", language: "en" })
    await prisma.prep.updateMany({ where: { id: { in: [ active.id, theirs.id ] } }, data: { isActive: true } })
    await addJobCall(active.id, 100, 50)
    await addJobCall(draft.id, 7, 7)
    await addJobCall(theirs.id, 500, 500)

    expect(await prepRepository.getOwnedTokens(OWNER)).toBe(150)
  })
})

describe("cost totals", () => {
  it("sums stored cost over a prep's jobs, wasted calls included", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    const other = await prepRepository.createPrep(OWNER, { title: "Other", language: "en" })
    await addJobCall(prep.id, 100, 50, false, 0.5)
    await addJobCall(prep.id, 10, 5, true, 0.25)
    await addJobCall(other.id, 1000, 1000, false, 10)

    expect(await prepRepository.getPrepCost(OWNER, prep.id)).toBe(0.75)
  })

  it("is zero for a prep with no jobs", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    expect(await prepRepository.getPrepCost(OWNER, prep.id)).toBe(0)
  })

  it("rejects a non-owner reading a private prep's cost", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "My Prep", language: "en" })
    await expect(prepRepository.getPrepCost(OTHER, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it("totals only the owner's active preps", async () => {
    const active = await prepRepository.createPrep(OWNER, { title: "Active", language: "en" })
    const draft = await prepRepository.createPrep(OWNER, { title: "Draft", language: "en" })
    const theirs = await prepRepository.createPrep(OTHER, { title: "Theirs", language: "en" })
    await prisma.prep.updateMany({ where: { id: { in: [ active.id, theirs.id ] } }, data: { isActive: true } })
    await addJobCall(active.id, 100, 50, false, 0.5)
    await addJobCall(draft.id, 7, 7, false, 3)
    await addJobCall(theirs.id, 500, 500, false, 9)

    expect(await prepRepository.getOwnedCost(OWNER)).toBe(0.5)
  })
})
