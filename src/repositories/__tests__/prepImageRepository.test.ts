import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", async () => {
  const { createPglitePrisma } = await import("@/test/pglitePrisma")
  return { prisma: await createPglitePrisma() }
})

import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

const OWNER = "user-owner"
const OTHER = "user-other"

beforeEach(async () => {
  await prisma.prepImage.deleteMany()
  await prisma.prep.deleteMany()
})

describe("createImage / listImages", () => {
  it("creates pending rows for the owner and lists them in creation order", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    await prepImageRepository.createImage(OWNER, prep.id, "prep-pages/p/page-0.jpg")
    await prepImageRepository.createImage(OWNER, prep.id, "prep-pages/p/page-1.jpg")

    const images = await prepImageRepository.listImages(OWNER, prep.id)
    expect(images.map(i => i.gcsKey)).toEqual([ "prep-pages/p/page-0.jpg", "prep-pages/p/page-1.jpg" ])
    expect(images.every(i => i.status === "pending")).toBe(true)
  })

  it("rejects a non-owner, even for listing", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    await expect(prepImageRepository.createImage(OTHER, prep.id, "key")).rejects.toThrow(ForbiddenError)
    await expect(prepImageRepository.listImages(OTHER, prep.id)).rejects.toThrow(ForbiddenError)
  })

  it("throws NotFoundError for a missing prep", async () => {
    await expect(prepImageRepository.createImage(OWNER, "does-not-exist", "key")).rejects.toThrow(NotFoundError)
  })
})

describe("status transitions", () => {
  it("moves pending → processing → done, writing the ocr result", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    await prepImageRepository.startProcessing(OWNER, image.id)
    const ocrResult = { text: "hello", visual_elements: [] }
    await prepImageRepository.finishImage(OWNER, image.id, ocrResult)

    const [ reloaded ] = await prepImageRepository.listImages(OWNER, prep.id)
    expect(reloaded.status).toBe("done")
    expect(prepImageRepository.toOcrResult(reloaded)).toEqual(ocrResult)
  })

  it("moves pending → processing → failed, writing the error and leaving it retryable", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    await prepImageRepository.startProcessing(OWNER, image.id)
    await prepImageRepository.failImage(OWNER, image.id, "low_confidence: too blurry")

    const [ failed ] = await prepImageRepository.listImages(OWNER, prep.id)
    expect(failed.status).toBe("failed")
    expect(failed.error).toBe("low_confidence: too blurry")

    // Retrying re-enters processing and clears the stale error.
    await prepImageRepository.startProcessing(OWNER, image.id)
    const [ retried ] = await prepImageRepository.listImages(OWNER, prep.id)
    expect(retried.status).toBe("processing")
    expect(retried.error).toBeNull()
  })

  it("rejects finishing or failing a row that isn't processing", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    await expect(prepImageRepository.finishImage(OWNER, image.id, { text: "x", visual_elements: [] })).rejects.toThrow()
    await expect(prepImageRepository.failImage(OWNER, image.id, "err")).rejects.toThrow()
  })

  it("rejects starting processing on a row that's already processing or done", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")
    await prepImageRepository.startProcessing(OWNER, image.id)

    await expect(prepImageRepository.startProcessing(OWNER, image.id)).rejects.toThrow()

    await prepImageRepository.finishImage(OWNER, image.id, { text: "x", visual_elements: [] })
    await expect(prepImageRepository.startProcessing(OWNER, image.id)).rejects.toThrow()
  })

  it("rejects a non-owner driving another user's image through a transition", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    const image = await prepImageRepository.createImage(OWNER, prep.id, "key")

    await expect(prepImageRepository.startProcessing(OTHER, image.id)).rejects.toThrow(ForbiddenError)
  })
})

describe("cascade delete", () => {
  it("removes a prep's images when the prep is deleted", async () => {
    const prep = await prepRepository.createPrep(OWNER, { title: "Prep", language: "en" })
    await prepImageRepository.createImage(OWNER, prep.id, "key")

    await prepRepository.deletePrep(OWNER, prep.id)

    expect(await prisma.prepImage.findMany({ where: { prepId: prep.id } })).toHaveLength(0)
  })
})
