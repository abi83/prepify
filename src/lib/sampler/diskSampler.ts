import { mkdir, writeFile } from "fs/promises"
import path from "path"

import type { AgentSample, Sampler } from "@/core/sampler"

import { createRateSampler } from "./rateSampler"
import { serializeSample } from "./storedSample"

/** Writes the sample under `dir`, mirroring the GCS object layout. */
export function createDiskSampleWriter(dir: string): (sample: AgentSample) => Promise<void> {
  return async (sample) => {
    const { key, body } = serializeSample(sample)
    const file = path.join(dir, key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body)
  }
}

export function createDiskSampler(dir: string, rate: number): Sampler {
  return createRateSampler(() => rate, createDiskSampleWriter(dir))
}
