import type { GenerationEntityType } from "@prisma/client"

import type { AgentMeta } from "../lib/agent"

/** Entities #194 covers today. Concepts get their own value once #48 makes them first-class. */
export type { GenerationEntityType }

/** One row of `GenerationMeta` — the polymorphic per-call usage/cost record for an entity. */
export interface GenerationMetaRecord {
  entityType: GenerationEntityType
  entityId: string
  model: string
  tier: string
  promptTokens: number
  cachedTokens: number
  completionTokens: number
  costUsd: number
  toolCalls: number
  executionMs: number
  wasted: boolean
}

/** Pure mapping from an agent call's app-shaped meta to a persistable GenerationMeta record. */
export function toGenerationMeta(
  entityType: GenerationEntityType,
  entityId: string,
  meta: AgentMeta,
  wasted = false,
): GenerationMetaRecord {
  return {
    entityType,
    entityId,
    model: meta.model,
    tier: meta.tier,
    promptTokens: meta.promptTokens,
    cachedTokens: meta.cachedTokens,
    completionTokens: meta.completionTokens,
    costUsd: meta.costUsd,
    toolCalls: meta.toolCalls,
    executionMs: meta.executionMs,
    wasted,
  }
}
