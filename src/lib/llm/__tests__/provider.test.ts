import { describe, expect, it } from "vitest"

import { createLlm } from "@/lib/llm/createLlm"
import { GeminiLlm } from "@/lib/llm/geminiLlm"
import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { providerOf } from "@/lib/llm/provider"
import { testCatalog } from "@/test/modelCatalog"

describe("providerOf", () => {
  it("returns the BYOK provider of a catalog model", () => {
    expect(providerOf(testCatalog, "gpt-5-nano")).toBe("openai")
    expect(providerOf(testCatalog, "gemini-3.1-flash-lite")).toBe("gemini")
  })

  it("throws for an unlisted model and for a provider that takes no key", () => {
    expect(() => providerOf(testCatalog, "nope")).toThrow(/not in the model catalog/)
    expect(() => providerOf(testCatalog, "local-model")).toThrow(/does not take an API key/)
  })
})

describe("createLlm", () => {
  it("builds the adapter of the provider", () => {
    expect(createLlm("openai", "k")).toBeInstanceOf(OpenAiLlm)
    expect(createLlm("gemini", "k")).toBeInstanceOf(GeminiLlm)
  })
})
