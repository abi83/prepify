import type { Question, AssetHint } from '../types/questions'
import { routeAsset } from './agents/assets/assetRouter'
import { supabase } from './supabase'
import { incrementPrepTokensInDb } from './tokenUsage'

function extractAssetHint(question: Question): AssetHint | undefined {
  const content = question.content as Record<string, unknown>
  return content.asset_hint as AssetHint | undefined
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
    .filter((x): x is { q: Question; hint: AssetHint & { needed: true } } =>
      x.hint?.needed === true
    )

  if (pending.length === 0) return

  await Promise.allSettled(
    pending.map(async ({ q, hint }) => {
      try {
        const result = await routeAsset(hint, apiKey, model, signal)
        if (!result.output.blob) return

        await supabase.from('assets').insert({
          question_id: q.id,
          type: result.output.type,
          blob: result.output.blob,
        })

        if (result.metrics.total_tokens > 0) {
          void incrementPrepTokensInDb(prepId, result.metrics.total_tokens)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.warn(`[assets] failed to generate asset for question ${q.id}:`, e)
        }
      }
    })
  )
}
