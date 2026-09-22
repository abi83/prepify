"use server"

import type { AgentMeta } from "@/lib/agent"
import * as generationMetaRepository from "@/repositories/generationMetaRepository"
import { toGenerationMeta, type GenerationEntityType } from "@/types/generationMeta"

/**
 * Fire-and-forget from the client pipeline as generation progresses — no revalidation needed.
 * No-ops for a meta with no tokens — e.g. a reviewer/merger call skipped because there was
 * nothing to send to the model, which never reached `runAgent`.
 */
export async function recordGenerationMeta(
  entityType: GenerationEntityType,
  entityId: string,
  meta: AgentMeta,
  wasted = false,
): Promise<void> {
  if (meta.promptTokens + meta.completionTokens + meta.cachedTokens === 0) return
  await generationMetaRepository.record(toGenerationMeta(entityType, entityId, meta, wasted))
}

/** Batched variant of `recordGenerationMeta` — one round-trip for several metas against the same entity. */
export async function recordGenerationMetaMany(
  entityType: GenerationEntityType,
  entityId: string,
  metas: AgentMeta[],
  wasted = false,
): Promise<void> {
  const billed = metas.filter(m => m.promptTokens + m.completionTokens + m.cachedTokens > 0)
  await generationMetaRepository.recordMany(billed.map(m => toGenerationMeta(entityType, entityId, m, wasted)))
}
