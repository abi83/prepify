import type { Prisma, PrepImage } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { ocrResultSchema, type OcrResult } from "@/types/prep"

import { ForbiddenError, NotFoundError } from "./errors"

async function assertOwnsPrep(userId: string, prepId: string): Promise<void> {
  const prep = await prisma.prep.findUnique({ where: { id: prepId } })
  if (!prep) throw new NotFoundError(`Prep ${prepId} not found`)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)
}

async function assertOwnsImage(userId: string, imageId: string): Promise<PrepImage> {
  const image = await prisma.prepImage.findUnique({ where: { id: imageId }, include: { prep: true } })
  if (!image) throw new NotFoundError(`PrepImage ${imageId} not found`)
  if (image.prep.userId !== userId) throw new ForbiddenError(`PrepImage ${imageId}'s prep is not owned by ${userId}`)
  return image
}

export async function createImage(userId: string, prepId: string, gcsKey: string): Promise<PrepImage> {
  await assertOwnsPrep(userId, prepId)
  return prisma.prepImage.create({ data: { prepId, gcsKey } })
}

export async function listImages(userId: string, prepId: string): Promise<PrepImage[]> {
  await assertOwnsPrep(userId, prepId)
  return prisma.prepImage.findMany({ where: { prepId }, orderBy: { createdAt: "asc" } })
}

/** Moves a row to `processing` — the only valid predecessor for both a first OCR attempt (`pending`)
 *  and a retry of a previously failed one (`failed`). Clears any stale error from a prior attempt. */
export async function startProcessing(userId: string, imageId: string): Promise<void> {
  const image = await assertOwnsImage(userId, imageId)
  if (image.status !== "pending" && image.status !== "failed") {
    throw new Error(`PrepImage ${imageId} can't start processing from status "${image.status}"`)
  }
  await prisma.prepImage.update({ where: { id: imageId }, data: { status: "processing", error: null } })
}

export async function finishImage(userId: string, imageId: string, ocrResult: OcrResult): Promise<void> {
  const image = await assertOwnsImage(userId, imageId)
  if (image.status !== "processing") {
    throw new Error(`PrepImage ${imageId} can't finish from status "${image.status}"`)
  }
  await prisma.prepImage.update({
    where: { id: imageId },
    data: { status: "done", ocrResult: ocrResult as unknown as Prisma.InputJsonValue },
  })
}

export async function failImage(userId: string, imageId: string, error: string): Promise<void> {
  const image = await assertOwnsImage(userId, imageId)
  if (image.status !== "processing") {
    throw new Error(`PrepImage ${imageId} can't fail from status "${image.status}"`)
  }
  await prisma.prepImage.update({ where: { id: imageId }, data: { status: "failed", error } })
}

/** Parses a `done` row's `ocrResult`, failing fast on anything a writer here didn't produce. */
export function toOcrResult(image: PrepImage): OcrResult {
  if (image.status !== "done") throw new Error(`PrepImage ${image.id} is not done`)
  return ocrResultSchema.parse(image.ocrResult)
}
