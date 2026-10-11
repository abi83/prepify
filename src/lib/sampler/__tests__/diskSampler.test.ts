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
    model: "m", tier: "flex", promptTokens: 1, cachedTokens: 0, completionTokens: 1,
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
    await createDiskSampler(dir, 1).record(SAMPLE)

    const written = JSON.parse(await readFile(path.join(dir, sampleObjectKey(SAMPLE)), "utf-8"))
    expect(storedSampleSchema.parse(written)).toMatchObject(SAMPLE)
  })

  it("writes nothing at rate 0", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "disk-sampler-"))
    await createDiskSampler(dir, 0).record(SAMPLE)

    expect(await readdir(dir)).toEqual([])
  })
})
