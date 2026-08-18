import type { Question } from '@prisma/client'
import type { AssetHint } from '../types/questions'
import { routeAsset, type ActiveAssetHint } from './agents/assets/assetRouter'
import { insertAsset } from '../actions/assets'
import { incrementPrepTokens } from '../actions/preps'

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
  prepId: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<void> {
  const pending = questions
    .map(q => ({ q, hint: extractAssetHint(q) }))
    .filter((x): x is { q: Question; hint: ActiveAssetHint } =>
      x.hint?.needed === true && x.hint.type !== null && x.hint.description !== null
    )

  if (pending.length === 0) return

  await Promise.allSettled(
    pending.map(async ({ q, hint }) => {
      try {
        const result = await routeAsset(hint, apiKey, model, signal)
        if (!result.output.blob) return

        await insertAsset(q.id, result.output.type, result.output.blob)

        if (result.metrics.total_tokens > 0) {
          void incrementPrepTokens(prepId, result.metrics.total_tokens)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.warn(`[assets] failed to generate asset for question ${q.id}:`, e)
        }
      }
    })
  )
}
