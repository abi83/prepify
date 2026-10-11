import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { NonRetryableLlmError, type Llm, type LlmRequest } from "@/core/ports"
import type { Sampler } from "@/core/sampler"
import { runAgent, sanitizeLLMText } from "@/lib/agent"
import { AGENT_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUT_MS } from "@/lib/config"
import { consoleLogger } from "@/lib/logger"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { hashPrompt } from "@/lib/sampler/promptHash"

describe("sanitizeLLMText", () => {
  it("passes through clean text unchanged", () => {
    expect(sanitizeLLMText("Hello, world!")).toBe("Hello, world!")
  })

  it("preserves tab, newline, and carriage return", () => {
    expect(sanitizeLLMText("a\tb\nc\rd")).toBe("a\tb\nc\rd")
  })

  it("strips null bytes", () => {
    expect(sanitizeLLMText("foo\u0000bar")).toBe("foobar")
  })

  it("strips other C0 controls (0x01–0x08, 0x0B, 0x0C, 0x0E–0x1F)", () => {
    const controls = "\x01\x02\x07\x0B\x0C\x0E\x1F"
    expect(sanitizeLLMText(`a${controls}b`)).toBe("ab")
  })

  it("strips lone surrogates", () => {
    expect(sanitizeLLMText("a\uD800b\uDFFFc")).toBe("abc")
  })

  it("preserves valid non-ASCII and emoji", () => {
    expect(sanitizeLLMText("café 🎉")).toBe("café 🎉")
  })
})

describe("runAgent", () => {
  const schema = z.object({ answer: z.string() })

  const complete = vi.fn<Llm["complete"]>()
  const llm: Llm = { complete }

  beforeEach(() => {
    complete.mockReset()
    complete.mockResolvedValue({ content: JSON.stringify({ answer: "ok" }), promptTokens: 10, cachedTokens: 0, completionTokens: 5 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function run(name: string, sampler: Sampler = noopSampler, userContent: Parameters<typeof runAgent>[0]["userContent"] = { textContent: "hello" }) {
    return runAgent({
      name,
      systemPrompt: "system",
      userContent,
      schema,
      signal: new AbortController().signal,
      deps: { llm, logger: consoleLogger, sampler },
    })
  }

  function lastRequest(): LlmRequest {
    return complete.mock.calls[complete.mock.calls.length - 1][0]
  }

  it("resolves the configured timeout for a listed agent name", async () => {
    await run("ocr")
    expect(lastRequest().timeoutMs).toBe(AGENT_TIMEOUT_MS.ocr)
  })

  it("falls back to the default timeout for an agent name not in the lookup", async () => {
    await run("SomeUnlistedAgent")
    expect(lastRequest().timeoutMs).toBe(DEFAULT_AGENT_TIMEOUT_MS)
  })

  it("builds app-shaped meta from the port's token counts", async () => {
    const { meta } = await run("SomeAgent")
    expect(meta).toMatchObject({ promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15 })
  })

  it("passes images through the port as image parts ahead of the text", async () => {
    await run("ocr", noopSampler, { textContent: "read this", images: [ { base64: "ZmFrZQ==", mimeType: "image/png" } ] })
    expect(lastRequest().messages[1].content).toEqual([
      { type: "image", mimeType: "image/png", base64: "ZmFrZQ==" },
      { type: "text", text: "read this" },
    ])
  })

  describe("retries", () => {
    it("retries a retryable error and returns the later success", async () => {
      vi.useFakeTimers()
      complete.mockRejectedValueOnce(new Error("503"))

      const result = run("SomeAgent")
      await vi.runAllTimersAsync()

      await expect(result).resolves.toMatchObject({ output: { answer: "ok" } })
      expect(complete).toHaveBeenCalledTimes(2)
    })

    it("gives up after three attempts and throws the last error", async () => {
      vi.useFakeTimers()
      complete.mockRejectedValue(new Error("503"))

      const result = run("SomeAgent")
      const assertion = expect(result).rejects.toThrow("503")
      await vi.runAllTimersAsync()

      await assertion
      expect(complete).toHaveBeenCalledTimes(3)
    })

    it("does not retry a non-retryable error", async () => {
      complete.mockRejectedValue(new NonRetryableLlmError("bad key"))

      await expect(run("SomeAgent")).rejects.toBeInstanceOf(NonRetryableLlmError)
      expect(complete).toHaveBeenCalledOnce()
    })
  })

  describe("sampling", () => {
    it("records the full execution with a sha-256 prompt hash", async () => {
      const record = vi.fn().mockResolvedValue(undefined)
      await run("SomeAgent", { record })
      await vi.waitFor(() => expect(record).toHaveBeenCalledOnce())
      expect(record).toHaveBeenCalledWith(expect.objectContaining({
        agent: "SomeAgent",
        systemPrompt: "system",
        promptHash: await hashPrompt("system"),
        input: { textContent: "hello", images: [] },
        output: { answer: "ok" },
      }))
    })

    it("does not fail the run when the sample write fails", async () => {
      const record = vi.fn().mockRejectedValue(new Error("gcs down"))
      await expect(run("SomeAgent", { record })).resolves.toMatchObject({ output: { answer: "ok" } })
    })
  })
})
