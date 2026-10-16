"use server"

import type { PrepImage } from "@prisma/client"
import { revalidatePath } from "next/cache"

import { deletePrepObjects } from "@/actions/uploads"
import { requireUserId } from "@/lib/currentUser"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import type { OcrResult } from "@/types/prep"

export async function createPrepImage(prepId: string, gcsKey: string): Promise<PrepImage> {
  const image = await prepImageRepository.createImage(await requireUserId(), prepId, gcsKey)
  revalidatePath(`/preps/${prepId}`)
  return image
}

export async function deleteMyPrepImage(imageId: string): Promise<void> {
  const image = await prepImageRepository.deleteImage(await requireUserId(), imageId)
  await deletePrepObjects([ image.gcsKey ])
  revalidatePath(`/preps/${image.prepId}`)
}

export async function listMyPrepImages(prepId: string): Promise<PrepImage[]> {
  return prepImageRepository.listImages(await requireUserId(), prepId)
}

export async function startProcessingPrepImage(imageId: string): Promise<void> {
  await prepImageRepository.startProcessing(await requireUserId(), imageId)
}

export async function finishPrepImage(imageId: string, ocrResult: OcrResult): Promise<void> {
  await prepImageRepository.finishImage(await requireUserId(), imageId, ocrResult)
}

export async function failPrepImage(imageId: string, error: string): Promise<void> {
  await prepImageRepository.failImage(await requireUserId(), imageId, error)
}
