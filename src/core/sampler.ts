import { z } from "zod"

/**
 * App-shaped usage/cost data for one agent call — never OpenAI's raw `usage` object.
 * This is what gets persisted as a `GenerationMeta` row (see src/types/generationMeta.ts)
 * and what callers use for progress/cost display. Nothing downstream of `runAgent`
 * should read an OpenAI response shape directly.
 */
export const agentMetaSchema = z.object({
  model: z.string(),
  tier: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  promptTokens: z.number(),
  cachedTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  costUsd: z.number(),
  toolCalls: z.number(),
  executionMs: z.number(),
})

export type AgentMeta = z.infer<typeof agentMetaSchema>

/** One recorded `runAgent` execution — the contract replay tooling (#264) reads back from the samples bucket. */
export const agentSampleSchema = z.object({
  executionId: z.uuid(),
  agent: z.string().min(1),
  systemPrompt: z.string().min(1),
  /** Semver, bumped by hand when the prompt text changes. */
  promptVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** sha-256 hex of `systemPrompt`. */
  promptHash: z.string().regex(/^[0-9a-f]{64}$/),
  input: z.object({
    textContent: z.string(),
    images: z.array(z.object({ base64: z.string(), mimeType: z.string() })),
  }),
  output: z.json(),
  meta: agentMetaSchema,
  timestamp: z.iso.datetime(),
})

/** What a sampler receives: stamped with `appVersion` by the process that writes the object. */
export type AgentSample = z.infer<typeof agentSampleSchema>

export const storedSampleSchema = agentSampleSchema.extend({
  /** Build version of the server that stored the sample (`package.json` version plus build suffix). */
  appVersion: z.string().min(1),
})

export type StoredSample = z.infer<typeof storedSampleSchema>

/** Records a finished agent execution. Whether to keep it is the implementation's call, not `runAgent`'s. */
export interface Sampler {
  record(sample: AgentSample): Promise<void>
}
