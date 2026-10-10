import { beforeEach, describe, expect, it, vi } from "vitest"

const { writeSample, requireUserId } = vi.hoisted(() => ({ writeSample: vi.fn(), requireUserId: vi.fn() }))

vi.mock("@/lib/sampler/gcsSampleStore", () => ({ writeSample }))
vi.mock("@/lib/currentUser", () => ({ requireUserId }))
vi.mock("@/lib/env", () => ({ config: { SAMPLE_RATE: 0.25 } }))

import { getSampleRate, recordSample } from "@/actions/samples"
import type { AgentSample } from "@/lib/sampler/schema"

const SAMPLE: AgentSample = {
  executionId: "0b9f6f4e-5a1c-4d2e-8c3b-1a2b3c4d5e6f",
  agent: "ocr",
  systemPrompt: "system",
  promptHash: "a".repeat(64),
  input: { textContent: "hi", images: [] },
  output: { text: "hello" },
  meta: {
    model: "m", tier: "flex", promptTokens: 1, cachedTokens: 0, completionTokens: 1,
    totalTokens: 2, costUsd: 0, toolCalls: 0, executionMs: 1,
  },
  timestamp: "2026-10-10T12:00:00.000Z",
}

describe("recordSample", () => {
  beforeEach(() => {
    writeSample.mockReset()
    requireUserId.mockReset().mockResolvedValue("user-1")
  })

  it("writes a valid sample", async () => {
    await recordSample(SAMPLE)
    expect(writeSample).toHaveBeenCalledWith(SAMPLE)
  })

  it("requires a signed-in user", async () => {
    requireUserId.mockRejectedValue(new Error("Unauthorized"))
    await expect(recordSample(SAMPLE)).rejects.toThrow("Unauthorized")
    expect(writeSample).not.toHaveBeenCalled()
  })

  it("rejects a payload that fails the schema", async () => {
    await expect(recordSample({ ...SAMPLE, promptHash: "bad" })).rejects.toThrow()
    expect(writeSample).not.toHaveBeenCalled()
  })

  it("rejects an oversized payload", async () => {
    const huge = { ...SAMPLE, input: { textContent: "x".repeat(12 * 1024 * 1024), images: [] } }
    await expect(recordSample(huge)).rejects.toThrow("too large")
    expect(writeSample).not.toHaveBeenCalled()
  })
})

describe("getSampleRate", () => {
  it("returns the configured rate", async () => {
    requireUserId.mockResolvedValue("user-1")
    expect(await getSampleRate()).toBe(0.25)
  })
})
