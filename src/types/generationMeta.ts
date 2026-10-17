import type { AgentMeta } from "@/core/sampler"

/** One row of `GenerationMeta` — the per-call usage/cost record for a job. */
export interface GenerationMetaRecord {
  jobId: string
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
export function toGenerationMeta(jobId: string, meta: AgentMeta, wasted = false): GenerationMetaRecord {
  return {
    jobId,
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
