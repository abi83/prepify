"use server"

import { Storage } from "@google-cloud/storage"
import { randomUUID } from "crypto"

import { requireUserId } from "@/lib/currentUser"
import { config } from "@/lib/env"

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

export type UploadUrlResult = {
  uploadUrl: string
  gcsKey: string
}

export async function getUploadSignedUrl(mimeType: string): Promise<UploadUrlResult> {
  const userId = await requireUserId()

  const ext = MIME_TO_EXT[mimeType]
  if (!ext) throw new Error(`Unsupported mime type: ${mimeType}`)

  const gcsKey = `photos/${userId}/${randomUUID()}.${ext}`

  const [uploadUrl] = await storage
    .bucket(config.GCS_BUCKET_NAME)
    .file(gcsKey)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + SIGNED_URL_TTL_MS,
      contentType: mimeType,
      extensionHeaders: {
        "x-goog-content-length-range": `0,${MAX_UPLOAD_BYTES}`,
      },
    })

  return { uploadUrl, gcsKey }
}
