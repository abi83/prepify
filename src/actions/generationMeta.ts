"use server"

import type { AgentMeta } from "../lib/agent"
import * as generationMetaRepository from "../repositories/generationMetaRepository"
import { toGenerationMeta, type GenerationEntityType } from "../types/generationMeta"

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
