import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { Logger } from "@/core/logger"
import { DEFAULT_MAX_TOKENS, NonRetryableLlmError, type Llm, type LlmRequest } from "@/core/ports"
import type { Sampler } from "@/core/sampler"
import { runAgent, sanitizeLLMText } from "@/lib/agent"
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

  const TIMEOUT_MS = 7_000
  const warn = vi.fn()
  const debug = vi.fn()
  const logger = { debug, info: vi.fn(), warn, error: vi.fn() } as unknown as Logger

  const complete = vi.fn<Llm["complete"]>()
  const llm: Llm = { complete }

  beforeEach(() => {
    complete.mockReset()
    warn.mockReset()
    debug.mockReset()
    complete.mockResolvedValue({ content: JSON.stringify({ answer: "ok" }), promptTokens: 10, cachedTokens: 0, completionTokens: 5, temperature: 1, maxTokens: 32_000 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function run(name: string, sampler: Sampler = noopSampler, userContent: Parameters<typeof runAgent>[0]["userContent"] = { textContent: "hello" }) {
    return runAgent({
      name,
      promptId: "test",
      promptVersion: "1.0.0",
      systemPrompt: "system",
      userContent,
      schema,
      signal: new AbortController().signal,
      deps: { llm, logger, sampler, timeoutMs: TIMEOUT_MS },
    })
  }

  /** Hashing the prompt is real async work; wait for the first LLM call so the retry timers exist before they're flushed. */
  async function drainTimers() {
    await vi.waitFor(() => expect(complete).toHaveBeenCalled())
    await vi.runAllTimersAsync()
  }

  function lastRequest(): LlmRequest {
    return complete.mock.calls[complete.mock.calls.length - 1][0]
  }

  it("sends the deps' timeout to the Llm", async () => {
    await run("ocr")
    expect(lastRequest().timeoutMs).toBe(TIMEOUT_MS)
  })

  it("requests DEFAULT_MAX_TOKENS unless the agent sets its own", async () => {
    await run("ocr")
    expect(lastRequest().maxTokens).toBe(DEFAULT_MAX_TOKENS)

    await runAgent({ name: "ocr", promptId: "test", promptVersion: "1.0.0", systemPrompt: "system", userContent: { textContent: "hello" }, schema, maxTokens: 4096, signal: new AbortController().signal, deps: { llm, logger, sampler: noopSampler, timeoutMs: TIMEOUT_MS } })
    expect(lastRequest().maxTokens).toBe(4096)
  })

  it("records the sampling settings the Llm reports, not the requested ones", async () => {
    complete.mockResolvedValue({ content: JSON.stringify({ answer: "ok" }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 0.3, maxTokens: 512 })
    const { meta } = await run("ocr")
    expect(meta).toMatchObject({ temperature: 0.3, maxTokens: 512 })
  })

  it("logs each attempt's start, retries included", async () => {
    vi.useFakeTimers()
    complete.mockRejectedValueOnce(new Error("503"))

    const result = run("ocr")
    await drainTimers()
    await result

    const fields = { model: "gpt-5-nano", tier: "flex", timeoutMs: TIMEOUT_MS, promptId: "test", promptVersion: "1.0.0", promptHash: await hashPrompt("system") }
    expect(debug).toHaveBeenCalledWith("agent:ocr: attempt 1/3 started", { ...fields, attempt: 1 })
    expect(debug).toHaveBeenCalledWith("agent:ocr: attempt 2/3 started", { ...fields, attempt: 2 })
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
      await drainTimers()

      await expect(result).resolves.toMatchObject({ output: { answer: "ok" } })
      expect(complete).toHaveBeenCalledTimes(2)
    })

    it("gives up after three attempts and throws the last error", async () => {
      vi.useFakeTimers()
      complete.mockRejectedValue(new Error("503"))

      const result = run("SomeAgent")
      const assertion = expect(result).rejects.toThrow("503")
      await drainTimers()

      await assertion
      expect(complete).toHaveBeenCalledTimes(3)
    })

    it("does not retry a non-retryable error, and logs it", async () => {
      complete.mockRejectedValue(new NonRetryableLlmError("bad key"))

      await expect(run("SomeAgent")).rejects.toBeInstanceOf(NonRetryableLlmError)
      expect(complete).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith("agent:SomeAgent: attempt 1/3 failed (not retryable)", expect.objectContaining({ attempt: 1 }))
    })

    it("logs every failed attempt and names the timeout in the final error", async () => {
      vi.useFakeTimers()
      complete.mockRejectedValue(new Error("Request timed out."))

      const result = run("ocr")
      const assertion = expect(result).rejects.toThrow("ocr: timed out after 7s (attempt 3/3)")
      await drainTimers()

      await assertion
      expect(warn).toHaveBeenCalledTimes(3)
      expect(warn).toHaveBeenLastCalledWith("agent:ocr: attempt 3/3 failed", expect.objectContaining({
        model: "gpt-5-nano", attempt: 3, timeoutMs: TIMEOUT_MS, elapsedMs: expect.any(Number),
      }))
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
        promptId: "test",
        promptVersion: "1.0.0",
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
