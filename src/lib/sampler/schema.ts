import { z } from "zod"

import { agentMetaSchema } from "@/lib/agent"

/** One recorded `runAgent` execution — the contract replay tooling (#264) reads back from the samples bucket. */
export const agentSampleSchema = z.object({
  executionId: z.uuid(),
  agent: z.string().min(1),
  systemPrompt: z.string().min(1),
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
  /** Build version of the server that stored the sample (git SHA/tag from `version.txt`). */
  appVersion: z.string().min(1),
})

export type StoredSample = z.infer<typeof storedSampleSchema>

/** Records a finished agent execution. Whether to keep it is the implementation's call, not `runAgent`'s. */
export interface Sampler {
  record(sample: AgentSample): Promise<void>
}
