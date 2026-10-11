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
  it("includes only active public preps, with question counts", async () => {
    const priv = await prepRepository.createPrep(OWNER, { title: "Private", language: "en" })
    const pub = await prepRepository.createPrep(OWNER, { title: "Public", language: "en" })
    await prepRepository.updatePrep(OWNER, pub.id, { visibility: "public" })
    await prisma.prep.update({ where: { id: pub.id }, data: { isActive: true } })
    await prisma.question.createMany({
      data: [
        { prepId: pub.id, type: "flashcard", content: {} },
        { prepId: pub.id, type: "flashcard", content: {} },
      ],
    })

    const catalog = await prepRepository.listPublicCatalog()
    expect(catalog.map(e => e.id)).toContain(pub.id)
    expect(catalog.map(e => e.id)).not.toContain(priv.id)
    expect(catalog.find(e => e.id === pub.id)?.questionCount).toBe(2)
  })
})

async function addJobCall(prepId: string, promptTokens: number, completionTokens: number, wasted = false): Promise<void> {
  const job = await prisma.job.create({
    data: { prepId, type: "question", model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0, createdBy: OWNER },
  })
  await prisma.generationMeta.create({
    data: { jobId: job.id, model: "gpt-5-nano", tier: "flex", promptTokens, cachedTokens: 0, completionTokens, costUsd: 0, toolCalls: 0, executionMs: 1, wasted },
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
