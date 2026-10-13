import OpenAI from "openai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { NonRetryableLlmError, type LlmRequest } from "@/core/ports"
import { DEFAULT_TEMPERATURE, OpenAiLlm } from "@/lib/llm/openAiLlm"

const request: LlmRequest = {
  model: "m",
  tier: "default",
  timeoutMs: 1000,
  maxTokens: 1000,
  messages: [ { role: "user", content: "hi" } ],
  responseFormat: { name: "x", schema: z.object({ a: z.string() }) },
}

function spyCreate(finishReason = "stop") {
  return vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue({
    choices: [ { finish_reason: finishReason, message: { content: "{}" } } ],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  } as never)
}

const sentParams = (spy: ReturnType<typeof spyCreate>) => spy.mock.calls[0][0] as unknown as Record<string, unknown>

const signal = new AbortController().signal

describe("OpenAiLlm sampling params", () => {
  afterEach(() => vi.restoreAllMocks())

  it("sends max_completion_tokens and temperature without a custom baseUrl", async () => {
    const spy = spyCreate()
    const response = await new OpenAiLlm({ apiKey: "k", temperature: 0.2 }).complete(request, signal)
    expect(sentParams(spy)).toMatchObject({ temperature: 0.2, max_completion_tokens: 1000 })
    expect(sentParams(spy)).not.toHaveProperty("max_tokens")
    expect(response).toMatchObject({ temperature: 0.2, maxTokens: 1000 })
  })

  it("sends max_tokens with a custom baseUrl", async () => {
    const spy = spyCreate()
    await new OpenAiLlm({ apiKey: "k", baseUrl: "http://localhost:1234/v1" }).complete(request, signal)
    expect(sentParams(spy)).toMatchObject({ max_tokens: 1000 })
    expect(sentParams(spy)).not.toHaveProperty("max_completion_tokens")
  })

  it("sends and reports the default temperature when none is set", async () => {
    const spy = spyCreate()
    const response = await new OpenAiLlm({ apiKey: "k" }).complete(request, signal)
    expect(sentParams(spy)).toMatchObject({ temperature: DEFAULT_TEMPERATURE })
    expect(response.temperature).toBe(DEFAULT_TEMPERATURE)
  })

  it("lets the constructor maxTokens override the request's and reports it", async () => {
    const spy = spyCreate()
    const response = await new OpenAiLlm({ apiKey: "k", maxTokens: 512 }).complete(request, signal)
    expect(sentParams(spy)).toMatchObject({ max_completion_tokens: 512 })
    expect(response.maxTokens).toBe(512)
  })

  it("throws NonRetryableLlmError when the completion hits the cap", async () => {
    spyCreate("length")
    const llm = new OpenAiLlm({ apiKey: "k", maxTokens: 512 })
    const error = await llm.complete(request, signal).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(NonRetryableLlmError)
    expect((error as Error).message).toBe("completion hit max tokens (512)")
  })
})
