import { Storage } from "@google-cloud/storage"

import { assertPrepPageKey } from "@/core/lib/prepPageKey"
import { config } from "@/lib/env"

const storage = new Storage()

/** Deletes uploaded page images from GCS. The caller must have already checked ownership of the prep. */
export async function deletePrepObjects(prepId: string, gcsKeys: string[]): Promise<void> {
  gcsKeys.forEach(key => assertPrepPageKey(prepId, key))
  await Promise.all(
    gcsKeys.map(key => storage.bucket(config.GCS_BUCKET_NAME).file(key).delete({ ignoreNotFound: true }))
  )
}
