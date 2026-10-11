import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const createMock = vi.fn()
const constructorMock = vi.fn()

vi.mock("openai", async importOriginal => {
  const actual = await importOriginal<typeof import("openai")>()
  class MockOpenAI {
    chat = { completions: { create: createMock } }
    constructor(options: unknown) {
      constructorMock(options)
    }
  }
  return { ...actual, default: MockOpenAI }
})

import { runAgent, sanitizeLLMText } from "@/lib/agent"
import { AGENT_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUT_MS } from "@/lib/config"
import { consoleLogger } from "@/lib/logger"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { hashPrompt } from "@/lib/sampler/promptHash"
import type { Sampler } from "@/lib/sampler/schema"

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

  beforeEach(() => {
    createMock.mockReset()
    constructorMock.mockReset()
    createMock.mockResolvedValue({
      choices: [ { message: { content: JSON.stringify({ answer: "ok" }), tool_calls: [] } } ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 0 } },
    })
  })

  async function run(name: string, sampler: Sampler = noopSampler) {
    return runAgent({
      name,
      systemPrompt: "system",
      userContent: { textContent: "hello" },
      schema,
      apiKey: "key",
      signal: new AbortController().signal,
      logger: consoleLogger,
      sampler,
    })
  }

  it("constructs the OpenAI client with maxRetries: 0 — runAgent owns retries, not the SDK", async () => {
    await run("SomeAgent")
    expect(constructorMock).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }))
  })

  it("resolves the configured timeout for a listed agent name", async () => {
    await run("ocr")
    expect(constructorMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: AGENT_TIMEOUT_MS.ocr }))
  })

  it("falls back to the default timeout for an agent name not in the lookup", async () => {
    await run("SomeUnlistedAgent")
    expect(constructorMock).toHaveBeenCalledWith(expect.objectContaining({ timeout: DEFAULT_AGENT_TIMEOUT_MS }))
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
