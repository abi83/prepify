import { Storage } from "@google-cloud/storage"

import { storedSampleSchema, type StoredSample } from "@/core/sampler"
import { cellPrefix, sampleObjectKey } from "@/lib/sampler/storedSample"

import type { Cell, ResultSink, SampleSource } from "./ports"

/** Reads `gs://{bucket}/samples/{agent}/{promptHash}/{model}/*.json`, the layout the GCS sampler writes. Auth via ADC. */
export function createGcsSampleSource(bucket: string, storage = new Storage()): SampleSource {
  return {
    async readCell(cell) {
      const [ files ] = await storage.bucket(bucket).getFiles({ prefix: `${cellPrefix(cell)}/` })
      const jsonFiles = files.filter(file => file.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name))
      if (jsonFiles.length === 0) throw new Error(`No samples under gs://${bucket}/${cellPrefix(cell)}/`)
      return Promise.all(jsonFiles.map(async (file): Promise<StoredSample> => {
        const [ content ] = await file.download()
        const parsed = storedSampleSchema.safeParse(JSON.parse(content.toString("utf-8")))
        if (!parsed.success) throw new Error(`Invalid sample gs://${bucket}/${file.name}: ${parsed.error.message}`)
        return parsed.data
      }))
    },
  }
}

/** Writes `gs://{bucket}/{keyPrefix}results/{agent}/{promptHash}/{model}/{evaluatorId}/{executionId|summary}.json`. */
export function createGcsResultSink(bucket: string, storage = new Storage(), keyPrefix = ""): ResultSink {
  const resultKey = (cell: Cell, evaluatorId: string, name: string) =>
    `${keyPrefix}${cellPrefix(cell).replace(/^samples/, "results")}/${evaluatorId}/${name}.json`

  const write = (key: string, content: unknown) =>
    storage.bucket(bucket).file(key).save(JSON.stringify(content, null, 2), { contentType: "application/json" })

  return {
    writeSampleResult: (cell, result) => write(resultKey(cell, result.evaluatorId, result.executionId), result),
    writeSummary: (cell, evaluatorId, summary) => write(resultKey(cell, evaluatorId, "summary"), summary),
  }
}

/** Copies the samples a run judged to `gs://{bucket}/{keyPrefix}samples/...`, next to the run's results. */
export async function uploadSamples(bucket: string, samples: StoredSample[], storage = new Storage(), keyPrefix = ""): Promise<void> {
  await Promise.all(samples.map(sample =>
    storage.bucket(bucket).file(`${keyPrefix}${sampleObjectKey(sample)}`).save(JSON.stringify(sample), { contentType: "application/json" })))
}

/** Forwards every write to all sinks. */
export function teeResultSinks(...sinks: ResultSink[]): ResultSink {
  return {
    writeSampleResult: async (cell, result) => { await Promise.all(sinks.map(sink => sink.writeSampleResult(cell, result))) },
    writeSummary: async (cell, evaluatorId, summary) => { await Promise.all(sinks.map(sink => sink.writeSummary(cell, evaluatorId, summary))) },
  }
}
