import type { AgentSample, StoredSample } from "@/core/sampler"
import { APP_VERSION } from "@/lib/logger/core"

/** `samples/{agent}/{promptHash}/{model}/{executionId}.json` — one object per sample, GCS has no append. `/` in the model id becomes `__` so agent × prompt × model is exactly one prefix. */
export function sampleObjectKey(sample: AgentSample): string {
  return `samples/${sample.agent}/${sample.promptHash}/${sample.meta.model.replace(/\//g, "__")}/${sample.executionId}.json`
}

/** The object key and serialized body every sample writer stores. */
export function serializeSample(sample: AgentSample): { key: string; body: string } {
  const stored: StoredSample = { ...sample, appVersion: APP_VERSION }
  return { key: sampleObjectKey(sample), body: JSON.stringify(stored) }
}
