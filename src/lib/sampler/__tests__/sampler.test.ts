import { describe, expect, it, vi } from "vitest"

import { hashPrompt } from "@/lib/sampler/promptHash"
import { createRateSampler } from "@/lib/sampler/rateSampler"
import { agentSampleSchema, type AgentSample } from "@/lib/sampler/schema"

const SAMPLE: AgentSample = {
  executionId: "0b9f6f4e-5a1c-4d2e-8c3b-1a2b3c4d5e6f",
  agent: "ocr",
  systemPrompt: "system",
  promptHash: "0".repeat(64),
  input: { textContent: "hi", images: [ { base64: "ZmFrZQ==", mimeType: "image/jpeg" } ] },
  output: { text: "hello" },
  meta: {
    model: "m", tier: "flex", promptTokens: 1, cachedTokens: 0, completionTokens: 1,
    totalTokens: 2, costUsd: 0, toolCalls: 0, executionMs: 1,
  },
  timestamp: "2026-10-10T12:00:00.000Z",
}

describe("hashPrompt", () => {
  it("returns the sha-256 hex digest", async () => {
    expect(await hashPrompt("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})

describe("agentSampleSchema", () => {
  it("accepts a well-formed sample", () => {
    expect(agentSampleSchema.parse(SAMPLE)).toEqual(SAMPLE)
  })

  it("rejects a malformed prompt hash", () => {
    expect(() => agentSampleSchema.parse({ ...SAMPLE, promptHash: "nope" })).toThrow()
  })
})

describe("createRateSampler", () => {
  it("writes when the roll is below the rate", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    await createRateSampler(() => 0.5, write, () => 0.49).record(SAMPLE)
    expect(write).toHaveBeenCalledWith(SAMPLE)
  })

  it("drops when the roll is at or above the rate", async () => {
    const write = vi.fn()
    await createRateSampler(() => 0.5, write, () => 0.5).record(SAMPLE)
    expect(write).not.toHaveBeenCalled()
  })

  it("never writes at rate 0 and always at rate 1", async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    await createRateSampler(() => 0, write, () => 0).record(SAMPLE)
    expect(write).not.toHaveBeenCalled()
    await createRateSampler(() => 1, write, () => 0.999).record(SAMPLE)
    expect(write).toHaveBeenCalledOnce()
  })
})
