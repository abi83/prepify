import { Storage } from "@google-cloud/storage"

import type { PrepData } from "@/core/ports"
import { config } from "@/lib/env"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepStateRepository from "@/repositories/prepStateRepository"

const storage = new Storage()

/** `PrepData` straight from the repositories and GCS (no signed URL). The caller has already checked `userId` owns the prep. */
export function serverPrepData(userId: string): PrepData {
  return {
    loadState: prepStateRepository.loadPrepState,
    listImages: prepId => prepImageRepository.listImages(userId, prepId),
    async downloadImage(_prepId, gcsKey) {
      const file = storage.bucket(config.GCS_BUCKET_NAME).file(gcsKey)
      const [ [ bytes ], [ metadata ] ] = await Promise.all([ file.download(), file.getMetadata() ])
      if (!metadata.contentType) throw new Error(`GCS object ${gcsKey} has no content type`)
      return { base64: bytes.toString("base64"), mimeType: metadata.contentType }
    },
  }
}
