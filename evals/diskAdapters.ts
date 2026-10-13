import { mkdir, readdir, readFile, writeFile } from "fs/promises"
import path from "path"

import { storedSampleSchema, type StoredSample } from "@/core/sampler"
import { cellPrefix } from "@/lib/sampler/storedSample"

import type { Cell, ResultSink, SampleSource } from "./ports"

/** Reads `{dir}/samples/{agent}/{promptHash}/{model}/*.json`, the layout the disk sampler writes. */
export function createDiskSampleSource(dir: string): SampleSource {
  return {
    async readCell(cell) {
      const cellDir = path.join(dir, cellPrefix(cell))
      const files = (await readdir(cellDir)).filter(name => name.endsWith(".json")).sort()
      return Promise.all(files.map(async (name): Promise<StoredSample> => {
        const file = path.join(cellDir, name)
        const parsed = storedSampleSchema.safeParse(JSON.parse(await readFile(file, "utf-8")))
        if (!parsed.success) throw new Error(`Invalid sample ${file}: ${parsed.error.message}`)
        return parsed.data
      }))
    },
  }
}

/** Writes `{dir}/results/{agent}/{promptHash}/{model}/{evaluatorId}/{executionId|summary}.json`. */
export function createDiskResultSink(dir: string): ResultSink {
  const resultDir = (cell: Cell, evaluatorId: string) =>
    path.join(dir, cellPrefix(cell).replace(/^samples/, "results"), evaluatorId)

  async function write(file: string, content: unknown): Promise<void> {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(content, null, 2))
  }

  return {
    writeSampleResult: (cell, result) => write(path.join(resultDir(cell, result.evaluatorId), `${result.executionId}.json`), result),
    writeSummary: (cell, evaluatorId, summary) => write(path.join(resultDir(cell, evaluatorId), "summary.json"), summary),
  }
}
