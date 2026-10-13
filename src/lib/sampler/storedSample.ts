import type { AgentSample, StoredSample } from "@/core/sampler"
import { APP_VERSION } from "@/lib/logger/core"

/** The sample directory of one agent × prompt × model cell. */
export function cellPrefix({ agent, promptHash, model }: { agent: string; promptHash: string; model: string }): string {
  return `samples/${agent}/${promptHash}/${model.replace(/\//g, "__")}`
}

/** `samples/{agent}/{promptHash}/{model}/{executionId}.json` — one object per sample, GCS has no append. `/` in the model id becomes `__` so agent × prompt × model is exactly one prefix. */
export function sampleObjectKey(sample: AgentSample): string {
  return `${cellPrefix({ agent: sample.agent, promptHash: sample.promptHash, model: sample.meta.model })}/${sample.executionId}.json`
}

/** The object key and serialized body every sample writer stores. */
export function serializeSample(sample: AgentSample): { key: string; body: string } {
  const stored: StoredSample = { ...sample, appVersion: APP_VERSION }
  return { key: sampleObjectKey(sample), body: JSON.stringify(stored) }
}
