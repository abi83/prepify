"use server"

import { Storage } from "@google-cloud/storage"

import { requireUserId } from "@/lib/currentUser"
import { config } from "@/lib/env"
import { ForbiddenError } from "@/repositories/errors"
import * as prepRepository from "@/repositories/prepRepository"

const storage = new Storage()

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/tiff": "tiff",
}

const SIGNED_URL_TTL_MS = 15 * 60 * 1000
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export async function getUploadSignedUrl(
  prepId: string,
  pageIndex: number,
  mimeType: string,
): Promise<{ key: string; signedUrl: string }> {
  const userId = await requireUserId()

  const prep = await prepRepository.getPrep(userId, prepId)
  if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} does not belong to this user`)

  const ext = MIME_TO_EXT[mimeType]
  if (!ext) throw new Error(`Unsupported mime type: ${mimeType}`)

  const key = `prep-pages/${prepId}/page-${pageIndex}.${ext}`

  const [ signedUrl ] = await storage
    .bucket(config.GCS_BUCKET_NAME)
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + SIGNED_URL_TTL_MS,
      contentType: mimeType,
      extensionHeaders: {
        "x-goog-content-length-range": `0,${MAX_UPLOAD_BYTES}`,
      },
    })

  return { key, signedUrl }
}
