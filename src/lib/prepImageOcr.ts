import { failPrepImage, finishPrepImage, startProcessingPrepImage } from "@/actions/prepImages"
import { getReadSignedUrl } from "@/actions/uploads"
import { runOcrAgent } from "@/lib/agents/OcrAgent"
import type { Logger } from "@/lib/logger"
import type { Sampler } from "@/lib/sampler/schema"
import type { OcrResult } from "@/types/prep"

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface OcrFileResult extends OcrResult {
  language: string
}

async function runOcrForFile(
  blob: Blob,
  mimeType: string,
  apiKey: string,
  model: string,
  tier: string,
  signal: AbortSignal,
  logger: Logger,
  sampler: Sampler,
): Promise<OcrFileResult> {
  const base64 = await blobToBase64(blob)
  const { output } = await runOcrAgent([ { base64, mimeType } ], apiKey, model, tier, signal, logger, sampler)
  return { text: output.text, visual_elements: output.visual_elements, language: output.language }
}

/** Runs `run`, writing the outcome to the image's `prep_images` row: `processing`, then `done`
 *  or `failed`. One image's failure is caught here, not thrown — it must not fail the whole batch. */
async function withOcrStatusUpdates(imageId: string, run: () => Promise<OcrFileResult>): Promise<OcrFileResult | null> {
  await startProcessingPrepImage(imageId)
  try {
    const result = await run()
    await finishPrepImage(imageId, { text: result.text, visual_elements: result.visual_elements })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR failed"
    await failPrepImage(imageId, message)
    return null
  }
}

/** Runs OCR for a just-uploaded image, straight from its in-memory `File`. */
export async function ocrImageFile(
  file: File,
  imageId: string,
  apiKey: string,
  model: string,
  tier: string,
  signal: AbortSignal,
  logger: Logger,
  sampler: Sampler,
): Promise<OcrFileResult | null> {
  return withOcrStatusUpdates(imageId, () => runOcrForFile(file, file.type, apiKey, model, tier, signal, logger, sampler))
}

/** Retries OCR for a single `prep_images` row — e.g. one that previously failed. Re-fetches the
 *  image from GCS since the original `File` no longer exists once its upload modal has closed. */
export async function retryPrepImage(
  prepId: string,
  image: { id: string; gcsKey: string },
  apiKey: string,
  model: string,
  tier: string,
  signal: AbortSignal,
  logger: Logger,
  sampler: Sampler,
): Promise<OcrFileResult | null> {
  return withOcrStatusUpdates(image.id, async () => {
    const signedUrl = await getReadSignedUrl(prepId, image.gcsKey)
    const blob = await fetch(signedUrl, { signal }).then(r => r.blob())
    return runOcrForFile(blob, blob.type, apiKey, model, tier, signal, logger, sampler)
  })
}
