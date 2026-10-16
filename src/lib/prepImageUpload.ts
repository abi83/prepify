import type { PrepImage } from "@prisma/client"

import { createPrepImage } from "@/actions/prepImages"
import { getUploadSignedUrl } from "@/actions/uploads"

export const MAX_IMAGES = 10
const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Picks the files that fit into the `MAX_IMAGES` budget. Any oversized file rejects the whole selection. */
export function validateNewFiles(incoming: File[], currentCount: number): { accepted: File[]; error: string | null } {
  const oversized = incoming.filter(f => f.size > MAX_FILE_BYTES).map(f => f.name)
  if (oversized.length > 0) {
    return { accepted: [], error: `${oversized.join(", ")} ${oversized.length === 1 ? "exceeds" : "exceed"} the 5 MB limit. Please use smaller images.` }
  }
  return { accepted: incoming.slice(0, MAX_IMAGES - currentCount), error: null }
}

/** Uploads one file to GCS and persists its `PrepImage` row. */
export async function uploadPrepImage(prepId: string, pageIndex: number, file: File): Promise<PrepImage> {
  const { signedUrl, key, contentLengthRange } = await getUploadSignedUrl(prepId, pageIndex, file.type)
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type, "x-goog-content-length-range": contentLengthRange },
  })
  if (!response.ok) throw new Error(`Upload of page ${pageIndex} failed (${response.status})`)
  return createPrepImage(prepId, key)
}

/** The page index `getUploadSignedUrl` encoded into a key: `prep-pages/<prepId>/page-<n>.<ext>`. */
export function pageIndexOf(gcsKey: string): number {
  const match = /\/page-(\d+)\.[^/]+$/.exec(gcsKey)
  if (!match) throw new Error(`Unexpected GCS key: ${gcsKey}`)
  return Number(match[1])
}
