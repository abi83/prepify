import { describe, expect, it } from "vitest"

import type { AgentSample } from "@/core/sampler"
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

const withModel = (model: string): AgentSample => ({ ...SAMPLE, meta: { ...SAMPLE.meta, model } })
const prefix = (key: string) => key.slice(0, key.lastIndexOf("/"))

describe("sampleObjectKey", () => {
  it("lays out agent, promptHash, model, executionId", () => {
    expect(sampleObjectKey(withModel("m"))).toBe(`samples/ocr/${"0".repeat(64)}/m/${SAMPLE.executionId}.json`)
  })

  it("gives different models different prefixes", () => {
    expect(prefix(sampleObjectKey(withModel("a")))).not.toBe(prefix(sampleObjectKey(withModel("b"))))
  })

  it("keeps a slashed model id to a single path segment", () => {
    const key = sampleObjectKey(withModel("google/gemma-4-26b-a4b"))

    expect(key).toBe(`samples/ocr/${"0".repeat(64)}/google__gemma-4-26b-a4b/${SAMPLE.executionId}.json`)
    expect(key.split("/")).toHaveLength(5)
  })
})
