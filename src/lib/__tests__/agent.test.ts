import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { Logger } from "@/core/logger"
import { DEFAULT_MAX_TOKENS, NonRetryableLlmError, type Llm, type LlmRequest } from "@/core/ports"
import type { Sampler } from "@/core/sampler"
import { runAgent, sanitizeLLMText } from "@/lib/agent"
import { createLogger } from "@/lib/logger/core"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { hashPrompt } from "@/lib/sampler/promptHash"
import { testCatalog } from "@/test/modelCatalog"

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
      promptVersion: "1.0.0",
      systemPrompt: "system",
      userContent,
      schema,
      signal: new AbortController().signal,
      deps: { llm, logger, sampler, catalog: testCatalog, timeoutMs: TIMEOUT_MS },
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

  it("logs the prompt before and the raw response after each call at debug, with images as sizes only", async () => {
    complete.mockResolvedValue({ content: JSON.stringify({ answer: "ok" }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 512 })
    const base64 = "A".repeat(400)
    await run("ocr", noopSampler, { textContent: "hello", images: [ { base64, mimeType: "image/jpeg" } ] })

    expect(debug).toHaveBeenCalledWith("agent:ocr: request", expect.objectContaining({
      model: "gpt-5-nano", attempt: 1, systemPrompt: "system", textContent: "hello", images: [ { mimeType: "image/jpeg", bytes: 300 } ],
    }))
    expect(debug).toHaveBeenCalledWith("agent:ocr: response", expect.objectContaining({ attempt: 1, rawResponse: JSON.stringify({ answer: "ok" }) }))
    expect(JSON.stringify(debug.mock.calls)).not.toContain(base64)
  })

  it("puts the raw response, truncated, in the warn when it fails schema validation", async () => {
    vi.useFakeTimers()
    const raw = JSON.stringify({ wrong: "x".repeat(5000) })
    complete.mockResolvedValue({ content: raw, promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 512 })

    const result = run("ocr")
    const assertion = expect(result).rejects.toThrow()
    await drainTimers()
    await assertion

    const failed = warn.mock.calls.filter(([ message ]) => String(message).includes("failed"))
    expect(failed).toHaveLength(4)
    expect(failed[0][1].rawResponse).toBe(`${raw.slice(0, 2000)}… [truncated, ${raw.length} chars]`)
  })

  it("emits no request or response lines at info, but still the warn with the raw response", async () => {
    vi.useFakeTimers()
    const lines: string[] = []
    const infoLogger = createLogger({ minLevel: "info", transport: (line) => lines.push(line) })
    complete.mockResolvedValue({ content: JSON.stringify({ wrong: "x" }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 512 })

    const result = runAgent({
      name: "ocr", promptVersion: "1.0.0", systemPrompt: "system", userContent: { textContent: "hello" }, schema,
      signal: new AbortController().signal,
      deps: { llm, logger: infoLogger, sampler: noopSampler, catalog: testCatalog, timeoutMs: TIMEOUT_MS },
    })
    const assertion = expect(result).rejects.toThrow()
    await drainTimers()
    await assertion

    const entries = lines.map((line) => JSON.parse(line) as { level: string, message: string, rawResponse?: string })
    expect(entries.filter((e) => e.message.endsWith(": request") || e.message.endsWith(": response"))).toEqual([])
    expect(entries.every((e) => e.level !== "debug")).toBe(true)
    expect(entries.some((e) => e.level === "warn" && e.rawResponse === JSON.stringify({ wrong: "x" }))).toBe(true)
  })

  it("warns without a raw response when the call itself fails", async () => {
    vi.useFakeTimers()
    complete.mockRejectedValue(new Error("boom"))

    const result = run("ocr")
    const assertion = expect(result).rejects.toThrow()
    await drainTimers()
    await assertion

    expect(warn.mock.calls[0][1].rawResponse).toBeUndefined()
  })

  it("sends the deps' timeout to the Llm", async () => {
    await run("ocr")
    expect(lastRequest().timeoutMs).toBe(TIMEOUT_MS)
  })

  it("requests DEFAULT_MAX_TOKENS unless the agent sets its own", async () => {
    await run("ocr")
    expect(lastRequest().maxTokens).toBe(DEFAULT_MAX_TOKENS)

    await runAgent({ name: "ocr", promptVersion: "1.0.0", systemPrompt: "system", userContent: { textContent: "hello" }, schema, maxTokens: 4096, signal: new AbortController().signal, deps: { llm, logger, sampler: noopSampler, catalog: testCatalog, timeoutMs: TIMEOUT_MS } })
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

    const fields = { model: "gpt-5-nano", tier: "flex", timeoutMs: TIMEOUT_MS, promptVersion: "1.0.0", promptHash: await hashPrompt("system") }
    expect(debug).toHaveBeenCalledWith("agent:ocr: attempt 1/4 started", { ...fields, attempt: 1 })
    expect(debug).toHaveBeenCalledWith("agent:ocr: attempt 2/4 started", { ...fields, attempt: 2 })
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

    it("gives up after four attempts and throws the last error", async () => {
      vi.useFakeTimers()
      complete.mockRejectedValue(new Error("503"))

      const result = run("SomeAgent")
      const assertion = expect(result).rejects.toThrow("503")
      await drainTimers()

      await assertion
      expect(complete).toHaveBeenCalledTimes(4)
    })

    it("backs off 1s → 10s → 100s, each ±50%", async () => {
      vi.useFakeTimers()
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout")
      complete.mockRejectedValue(new Error("429"))

      const result = run("SomeAgent")
      const assertion = expect(result).rejects.toThrow("429")
      await drainTimers()
      await assertion

      const waits = setTimeoutSpy.mock.calls.map(([ , ms ]) => ms as number).filter(ms => ms >= 500)
      expect(waits).toHaveLength(3)
      waits.forEach((ms, i) => {
        const base = 1000 * 10 ** i
        expect(ms).toBeGreaterThanOrEqual(base * 0.5)
        expect(ms).toBeLessThanOrEqual(base * 1.5)
      })
    })

    it("does not retry a non-retryable error, and logs it", async () => {
      complete.mockRejectedValue(new NonRetryableLlmError("bad key"))

      await expect(run("SomeAgent")).rejects.toBeInstanceOf(NonRetryableLlmError)
      expect(complete).toHaveBeenCalledOnce()
      expect(warn).toHaveBeenCalledWith("agent:SomeAgent: attempt 1/4 failed (not retryable)", expect.objectContaining({ attempt: 1 }))
    })

    it("logs every failed attempt and names the timeout in the final error", async () => {
      vi.useFakeTimers()
      complete.mockRejectedValue(new Error("Request timed out."))

      const result = run("ocr")
      const assertion = expect(result).rejects.toThrow("ocr: timed out after 7s (attempt 4/4)")
      await drainTimers()

      await assertion
      expect(warn).toHaveBeenCalledTimes(4)
      expect(warn).toHaveBeenLastCalledWith("agent:ocr: attempt 4/4 failed", expect.objectContaining({
        model: "gpt-5-nano", attempt: 4, timeoutMs: TIMEOUT_MS, elapsedMs: expect.any(Number),
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
