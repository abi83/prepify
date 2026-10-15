import { mkdir, mkdtemp, readdir, readFile, writeFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { cellPrefix } from "@/lib/sampler/storedSample"
import { createDiskResultSink, createDiskSampleSource } from "@evals/diskAdapters"

import { CELL, makeSample, writeSamples } from "./fixtures"

const tempDir = () => mkdtemp(path.join(tmpdir(), "prepify-evals-"))

describe("disk SampleSource", () => {
  it("reads and validates every sample of the cell, ignoring other cells", async () => {
    const dir = await tempDir()
    await writeSamples(dir, [ makeSample(1), makeSample(2) ])
    const otherDir = path.join(dir, cellPrefix({ ...CELL, model: "other" }))
    await mkdir(otherDir, { recursive: true })
    await writeFile(path.join(otherDir, "junk.json"), "not json")

    expect(await createDiskSampleSource(dir).readCell(CELL)).toEqual([ makeSample(1), makeSample(2) ])
  })

  it("throws on an invalid sample file, naming it", async () => {
    const dir = await tempDir()
    await writeSamples(dir, [ makeSample(1), { ...makeSample(2), promptHash: "bad" } ])
    await expect(createDiskSampleSource(dir).readCell(CELL)).rejects.toThrow(/Invalid sample .*1\.json/)
  })

  it("returns no samples for an empty cell dir", async () => {
    const dir = await tempDir()
    await mkdir(path.join(dir, cellPrefix(CELL)), { recursive: true })
    expect(await createDiskSampleSource(dir).readCell(CELL)).toEqual([])
  })

  it("throws when the cell dir does not exist", async () => {
    await expect(createDiskSampleSource(await tempDir()).readCell(CELL)).rejects.toThrow(/ENOENT/)
  })
})

describe("disk ResultSink", () => {
  it("mirrors the cell path under results/ plus the evaluator id", async () => {
    const dir = await tempDir()
    const sink = createDiskResultSink(dir)
    const result = { executionId: "e1", promptVersion: "1.0.0", promptHash: "ev", judgeModel: "judge", score: 0.5, reasoning: "ok" }
    await sink.writeSampleResult(CELL, result)
    await sink.writeSummary(CELL, "ev", { n: 1 })

    const resultDir = path.join(dir, "results", CELL.agent, CELL.promptHash, "org__model-x", "ev")
    expect((await readdir(resultDir)).sort()).toEqual([ "e1.json", "summary.json" ])
    expect(JSON.parse(await readFile(path.join(resultDir, "e1.json"), "utf-8"))).toEqual(result)
  })
})
