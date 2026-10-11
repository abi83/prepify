import type { Question } from "@prisma/client"

import { insertAsset } from "@/actions/assets"
import { recordGenerationMeta } from "@/actions/generationMeta"
import type { AgentDeps } from "@/core/ports"
import type { AssetHint } from "@/types/questions"

import { routeAsset, type ActiveAssetHint } from "./agents/assets/assetRouter"
import { serializeError } from "./logger"

function extractAssetHint(question: Question): AssetHint | null {
  const content = question.content as Record<string, unknown>
  return (content.asset_hint as AssetHint) ?? null
}

/**
 * For each question with asset_hint.needed=true, generate the asset HTML blob
 * and persist it to the assets table. Failures are logged but do not throw —
 * missing assets are a soft degradation, not a fatal error.
 */
export async function generateAndSaveAssets(
  questions: Question[],
  model: string,
  tier: string,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<void> {
  const { logger } = deps
  const pending = questions
    .map(q => ({ q, hint: extractAssetHint(q) }))
    .filter((x): x is { q: Question; hint: ActiveAssetHint } =>
      x.hint?.needed === true && x.hint.type !== null && x.hint.description !== null
    )

  if (pending.length === 0) return

  await Promise.allSettled(
    pending.map(async ({ q, hint }) => {
      try {
        const jobId = q.producedByJobId
        if (!jobId) throw new Error(`Question ${q.id} has no producing job to record asset cost against`)
        const result = await routeAsset(hint, model, tier, signal, deps)
        if (!result.output.blob) return

        await insertAsset(q.id, result.output.type, result.output.blob)

        void recordGenerationMeta(jobId, result.meta).catch(e => logger.warn("assets: failed to record GenerationMeta", { error: serializeError(e) }))
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          logger.warn("assets: failed to generate asset", { questionId: q.id, error: serializeError(e) })
        }
      }
    })
  )
}
