"use server"

import { requireUserId } from "@/lib/currentUser"
import { config } from "@/lib/env"
import { writeSample } from "@/lib/sampler/gcsSampleStore"
import { agentSampleSchema, type AgentSample } from "@/lib/sampler/schema"

// Just under the 12mb server-action body limit in next.config.ts.
const MAX_SAMPLE_BYTES = 11 * 1024 * 1024

/** Sampling rate the browser-side sampler rolls against — keeps the rate in server env, not the client bundle. */
export async function getSampleRate(): Promise<number> {
  await requireUserId()
  return config.SAMPLE_RATE
}

/**
 * Persists a sample from the client-side pipeline. The client has already decided to keep it,
 * so this writes unconditionally. Samples carry no BYOK key.
 */
export async function recordSample(sample: AgentSample): Promise<void> {
  await requireUserId()
  const size = Buffer.byteLength(JSON.stringify(sample))
  if (size > MAX_SAMPLE_BYTES) throw new Error(`Sample too large: ${size} bytes`)
  await writeSample(agentSampleSchema.parse(sample))
}
