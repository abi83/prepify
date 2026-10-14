import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { NonRetryableLlmError, type LlmRequest } from "@/core/ports"
import { OpenAiLlm, toSchemaName } from "@/lib/llm/openAiLlm"

describe("toSchemaName", () => {
  it("replaces characters OpenAI rejects", () => {
    expect(toSchemaName("eval:ocr")).toBe("eval_ocr")
  })

  it("keeps valid names unchanged", () => {
    expect(toSchemaName("QuestionReviewer-1_a")).toBe("QuestionReviewer-1_a")
  })

  it("throws on empty or over-long names", () => {
    expect(() => toSchemaName("")).toThrow()
    expect(() => toSchemaName("a".repeat(65))).toThrow()
  })
})

const request: LlmRequest = {
  model: "gpt-5-nano",
  tier: "flex",
  timeoutMs: 1000,
  maxTokens: 10,
  messages: [ { role: "user", content: "hi" } ],
  responseFormat: { name: "x", schema: z.object({}) },
}

const signal = new AbortController().signal

describe("OpenAiLlm connection errors", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("complete maps a CORS-blocked request to a non-retryable key error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    const err = await new OpenAiLlm({ apiKey: "sk-bad" }).complete(request, signal).catch(e => e)
    expect(err).toBeInstanceOf(NonRetryableLlmError)
    expect(err.message).toMatch(/API key/)
  })

  it("complete keeps timeouts retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("timed out"), { name: "AbortError" })))
    const err = await new OpenAiLlm({ apiKey: "sk-bad" }).complete(request, signal).catch(e => e)
    expect(err).not.toBeInstanceOf(NonRetryableLlmError)
  })

  it("isKeyValid is false for a CORS-blocked request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    expect(await new OpenAiLlm({ apiKey: "sk-bad" }).isKeyValid()).toBe(false)
  })
})
