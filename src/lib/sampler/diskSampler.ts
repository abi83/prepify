import { mkdir, readdir, writeFile } from "fs/promises"
import path from "path"

import type { AgentSample, Sampler } from "@/core/sampler"

import { capPerCell } from "./cellCap"
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

function createDiskCellCounter(dir: string): (prefix: string) => Promise<number> {
  return async (prefix) => {
    try {
      return (await readdir(path.join(dir, prefix))).length
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0
      throw error
    }
  }
}

export function createDiskSampler(dir: string, rate: number, maxPerCell: number): Sampler {
  return createRateSampler(() => rate, capPerCell(createDiskSampleWriter(dir), createDiskCellCounter(dir), () => maxPerCell))
}
