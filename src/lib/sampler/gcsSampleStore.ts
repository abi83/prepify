import { Storage } from "@google-cloud/storage"

import { config } from "@/lib/env"
import { APP_VERSION } from "@/lib/logger/core"

import { createRateSampler } from "./rateSampler"
import type { AgentSample, Sampler, StoredSample } from "./schema"

const storage = new Storage()

/** `samples/{agent}/{promptHash}/{yyyy-mm-dd}/{executionId}.json` — one object per sample, GCS has no append. */
export function sampleObjectKey(sample: AgentSample): string {
  return `samples/${sample.agent}/${sample.promptHash}/${sample.timestamp.slice(0, 10)}/${sample.executionId}.json`
}

/** Unconditional write — the keep/drop decision is made by the caller. */
export async function writeSample(sample: AgentSample): Promise<void> {
  const stored: StoredSample = { ...sample, appVersion: APP_VERSION }
  await storage
    .bucket(config.SAMPLES_BUCKET_NAME)
    .file(sampleObjectKey(sample))
    .save(JSON.stringify(stored), { contentType: "application/json" })
}

/** Server-side sampler: keeps `SAMPLE_RATE` of executions. */
export function createGcsSampler(): Sampler {
  return createRateSampler(() => config.SAMPLE_RATE, writeSample)
}
