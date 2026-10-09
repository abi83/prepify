"use server"

import type { PrepImage } from "@prisma/client"

import { requireUserId } from "@/lib/currentUser"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import type { OcrResult } from "@/types/prep"

export async function createPrepImage(prepId: string, gcsKey: string): Promise<PrepImage> {
  return prepImageRepository.createImage(await requireUserId(), prepId, gcsKey)
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
