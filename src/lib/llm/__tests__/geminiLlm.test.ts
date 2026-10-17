import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { NonRetryableLlmError, type LlmRequest } from "@/core/ports"
import { GeminiLlm } from "@/lib/llm/geminiLlm"

const request: LlmRequest = {
  model: "gemini-3.1-flash-lite",
  tier: "default",
  timeoutMs: 1000,
  maxTokens: 100,
  messages: [
    { role: "system", content: "be brief" },
    { role: "user", content: [ { type: "text", text: "hi" }, { type: "image", mimeType: "image/png", base64: "AAAA" } ] },
  ],
  responseFormat: { name: "x", schema: z.object({ a: z.string() }) },
}

const signal = new AbortController().signal

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe("GeminiLlm.complete", () => {
  it("sends a structured-output request and maps usage, counting thinking tokens as output", async () => {
    const fetchMock = stubFetch(200, {
      candidates: [ { content: { parts: [ { text: "{\"a\":\"b\"}" } ] }, finishReason: "STOP" } ],
      usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 4, candidatesTokenCount: 5, thoughtsTokenCount: 7 },
    })
    const response = await new GeminiLlm({ apiKey: "k" }).complete(request, signal)

    expect(response).toEqual({ content: "{\"a\":\"b\"}", promptTokens: 10, cachedTokens: 4, completionTokens: 12, temperature: 1, maxTokens: 100 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.systemInstruction.parts).toEqual([ { text: "be brief" } ])
    expect(body.contents[0].parts).toEqual([ { text: "hi" }, { inlineData: { mimeType: "image/png", data: "AAAA" } } ])
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json", maxOutputTokens: 100, temperature: 1 })
    expect(body.generationConfig.responseJsonSchema.properties.a.type).toBe("string")
    expect(body.serviceTier).toBe("standard")
  })

  it("throws a non-retryable error when the completion hits the token cap", async () => {
    stubFetch(200, { candidates: [ { content: { parts: [ { text: "{" } ] }, finishReason: "MAX_TOKENS" } ] })
    await expect(new GeminiLlm({ apiKey: "k" }).complete(request, signal)).rejects.toBeInstanceOf(NonRetryableLlmError)
  })

  it("maps a rejected key (400) to a non-retryable error but keeps server errors retryable", async () => {
    stubFetch(400, { error: { code: 400, message: "API key not valid", status: "INVALID_ARGUMENT" } })
    await expect(new GeminiLlm({ apiKey: "bad" }).complete(request, signal)).rejects.toBeInstanceOf(NonRetryableLlmError)

    stubFetch(503, { error: { code: 503, message: "overloaded", status: "UNAVAILABLE" } })
    const err = await new GeminiLlm({ apiKey: "k" }).complete(request, signal).catch(e => e)
    expect(err).not.toBeInstanceOf(NonRetryableLlmError)
  })
})

describe("GeminiLlm.isKeyValid", () => {
  it("is true for a listed key, false for a rejected one, and throws on other failures", async () => {
    stubFetch(200, { models: [] })
    expect(await new GeminiLlm({ apiKey: "k" }).isKeyValid()).toBe(true)

    stubFetch(400, { error: { code: 400, message: "API key not valid", status: "INVALID_ARGUMENT" } })
    expect(await new GeminiLlm({ apiKey: "bad" }).isKeyValid()).toBe(false)

    stubFetch(500, { error: { code: 500, message: "boom", status: "INTERNAL" } })
    await expect(new GeminiLlm({ apiKey: "k" }).isKeyValid()).rejects.toThrow()
  })
})
