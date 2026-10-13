import type { Storage } from "@google-cloud/storage"
import { describe, expect, it } from "vitest"

import { cellPrefix, sampleObjectKey } from "@/lib/sampler/storedSample"
import { createGcsResultSink, createGcsSampleSource, teeResultSinks, uploadSamples } from "@evals/gcsAdapters"

import { CELL, makeSample } from "./fixtures"

/** In-memory bucket: key → body. */
function fakeStorage(objects: Record<string, string> = {}) {
  const storage = {
    bucket: () => ({
      getFiles: async ({ prefix }: { prefix: string }) => [
        Object.keys(objects).filter(name => name.startsWith(prefix)).map(name => ({
          name,
          download: async () => [ Buffer.from(objects[name]) ],
        })),
      ],
      file: (key: string) => ({
        save: async (body: string) => { objects[key] = body },
      }),
    }),
  }
  return { storage: storage as unknown as Storage, objects }
}

const key = (n: number) => sampleObjectKey(makeSample(n))

describe("GCS SampleSource", () => {
  it("reads and validates every sample of the cell, ignoring other cells", async () => {
    const { storage } = fakeStorage({
      [key(2)]: JSON.stringify(makeSample(2)),
      [key(1)]: JSON.stringify(makeSample(1)),
      [`${cellPrefix({ ...CELL, model: "other" })}/junk.json`]: "not json",
    })
    expect(await createGcsSampleSource("b", storage).readCell(CELL)).toEqual([ makeSample(1), makeSample(2) ])
  })

  it("throws on an invalid sample, naming it", async () => {
    const { storage } = fakeStorage({
      [key(1)]: JSON.stringify(makeSample(1)),
      [key(2)]: JSON.stringify({ ...makeSample(2), promptHash: "bad" }),
    })
    await expect(createGcsSampleSource("b", storage).readCell(CELL)).rejects.toThrow(/Invalid sample gs:\/\/b\/.*0002\.json/)
  })

  it("throws on an empty cell", async () => {
    await expect(createGcsSampleSource("b", fakeStorage().storage).readCell(CELL)).rejects.toThrow(/No samples/)
  })
})

describe("GCS ResultSink", () => {
  it("mirrors the cell path under results/ plus the evaluator id", async () => {
    const { storage, objects } = fakeStorage()
    const sink = createGcsResultSink("b", storage)
    const result = { executionId: "e1", evaluatorId: "ev", judgeModel: "judge", score: 0.5, reasoning: "ok" }
    await sink.writeSampleResult(CELL, result)
    await sink.writeSummary(CELL, "ev", { n: 1 })

    const prefix = `results/${CELL.agent}/${CELL.promptHash}/org__model-x/ev`
    expect(Object.keys(objects).sort()).toEqual([ `${prefix}/e1.json`, `${prefix}/summary.json` ])
    expect(JSON.parse(objects[`${prefix}/e1.json`])).toEqual(result)
  })
})

describe("artifacts", () => {
  it("uploads samples and tees results under the run prefix", async () => {
    const { storage, objects } = fakeStorage()
    await uploadSamples("a", [ makeSample(1) ], storage, "runs/r1/")
    const sink = teeResultSinks(createGcsResultSink("a", storage, "runs/r1/"))
    await sink.writeSummary(CELL, "ev", { n: 1 })

    expect(Object.keys(objects).sort()).toEqual([
      `runs/r1/results/${CELL.agent}/${CELL.promptHash}/org__model-x/ev/summary.json`,
      `runs/r1/${key(1)}`,
    ])
  })
})
