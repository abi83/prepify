import { mkdtemp, readFile, readdir, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { afterEach, describe, expect, it } from "vitest"

import { storedSampleSchema, type AgentSample } from "@/core/sampler"
import { createDiskSampler } from "@/lib/sampler/diskSampler"
import { sampleObjectKey } from "@/lib/sampler/storedSample"

const SAMPLE: AgentSample = {
  executionId: "0b9f6f4e-5a1c-4d2e-8c3b-1a2b3c4d5e6f",
  agent: "ocr",
  systemPrompt: "system",
  promptHash: "0".repeat(64),
  input: { textContent: "hi", images: [] },
  output: { text: "hello" },
  meta: {
    model: "m", tier: "flex", temperature: 1, maxTokens: 32_000, promptTokens: 1, cachedTokens: 0, completionTokens: 1,
    totalTokens: 2, costUsd: 0, toolCalls: 0, executionMs: 1,
  },
  timestamp: "2026-10-10T12:00:00.000Z",
}

let dir: string

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("createDiskSampler", () => {
  it("writes a sample that validates against storedSampleSchema at the GCS key layout", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "disk-sampler-"))
    await createDiskSampler(dir, 1, 100).record(SAMPLE)

    const written = JSON.parse(await readFile(path.join(dir, sampleObjectKey(SAMPLE)), "utf-8"))
    expect(storedSampleSchema.parse(written)).toMatchObject(SAMPLE)
  })

  it("stops writing once the cell holds maxPerCell samples", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "disk-sampler-"))
    const sampler = createDiskSampler(dir, 1, 2)
    const ids = [ "1", "2", "3" ].map(n => `${n.repeat(8)}-5a1c-4d2e-8c3b-1a2b3c4d5e6f`)
    for (const executionId of ids) await sampler.record({ ...SAMPLE, executionId })

    expect(await readdir(path.dirname(path.join(dir, sampleObjectKey(SAMPLE))))).toHaveLength(2)
  })

  it("caps each cell independently", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "disk-sampler-"))
    const sampler = createDiskSampler(dir, 1, 1)
    await sampler.record(SAMPLE)
    const other = { ...SAMPLE, meta: { ...SAMPLE.meta, model: "other" } }
    await sampler.record(other)

    await readFile(path.join(dir, sampleObjectKey(other)))
  })

  it("writes nothing at rate 0", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "disk-sampler-"))
    await createDiskSampler(dir, 0, 100).record(SAMPLE)

    expect(await readdir(dir)).toEqual([])
  })
})
