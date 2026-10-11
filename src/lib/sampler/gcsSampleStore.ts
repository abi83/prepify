import { Storage } from "@google-cloud/storage"

import type { AgentSample, Sampler } from "@/core/sampler"
import { config } from "@/lib/env"

import { createRateSampler } from "./rateSampler"
import { serializeSample } from "./storedSample"

const storage = new Storage()

/** Unconditional write — the keep/drop decision is made by the caller. */
export async function writeSample(sample: AgentSample): Promise<void> {
  const { key, body } = serializeSample(sample)
  await storage
    .bucket(config.SAMPLES_BUCKET_NAME)
    .file(key)
    .save(body, { contentType: "application/json" })
}

/** Server-side sampler: keeps `SAMPLE_RATE` of executions. */
export function createGcsSampler(): Sampler {
  return createRateSampler(() => config.SAMPLE_RATE, writeSample)
}
