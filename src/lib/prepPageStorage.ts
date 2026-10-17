import { Storage } from "@google-cloud/storage"

import { config } from "@/lib/env"

const storage = new Storage()

export const prepPagesPrefix = (prepId: string) => `prep-pages/${prepId}/`

export function assertPrepPageKey(prepId: string, gcsKey: string): void {
  const name = gcsKey.slice(prepPagesPrefix(prepId).length)
  if (!gcsKey.startsWith(prepPagesPrefix(prepId)) || !name || name.includes("/") || name.includes("..")) {
    throw new Error(`GCS key "${gcsKey}" is not a page key of prep ${prepId}`)
  }
}

/** Deletes uploaded page images from GCS. The caller must have already checked ownership of the prep. */
export async function deletePrepObjects(prepId: string, gcsKeys: string[]): Promise<void> {
  gcsKeys.forEach(key => assertPrepPageKey(prepId, key))
  await Promise.all(
    gcsKeys.map(key => storage.bucket(config.GCS_BUCKET_NAME).file(key).delete({ ignoreNotFound: true }))
  )
}
