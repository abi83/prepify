import { Storage } from "@google-cloud/storage"

import type { AgentSample, Sampler } from "@/core/sampler"
import { config } from "@/lib/env"

import { capPerCell } from "./cellCap"
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

async function countCellSamples(prefix: string, limit: number): Promise<number> {
  const [ files ] = await storage
    .bucket(config.SAMPLES_BUCKET_NAME)
    .getFiles({ prefix: `${prefix}/`, maxResults: limit, autoPaginate: false })
  return files.length
}

/** Like `writeSample`, but a no-op once the cell holds `SAMPLE_MAX_PER_CELL` samples. */
export const writeSampleWithinCap = capPerCell(writeSample, countCellSamples, () => config.SAMPLE_MAX_PER_CELL)

/** Server-side sampler: keeps `SAMPLE_RATE` of executions, up to `SAMPLE_MAX_PER_CELL` per cell. */
export function createGcsSampler(): Sampler {
  return createRateSampler(() => config.SAMPLE_RATE, writeSampleWithinCap)
}
