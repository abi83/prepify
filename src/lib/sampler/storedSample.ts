import type { AgentSample, StoredSample } from "@/core/sampler"
import { APP_VERSION } from "@/lib/logger/core"

/** `samples/{agent}/{promptHash}/{yyyy-mm-dd}/{executionId}.json` — one object per sample, GCS has no append. */
export function sampleObjectKey(sample: AgentSample): string {
  return `samples/${sample.agent}/${sample.promptHash}/${sample.timestamp.slice(0, 10)}/${sample.executionId}.json`
}

/** The object key and serialized body every sample writer stores. */
export function serializeSample(sample: AgentSample): { key: string; body: string } {
  const stored: StoredSample = { ...sample, appVersion: APP_VERSION }
  return { key: sampleObjectKey(sample), body: JSON.stringify(stored) }
}
