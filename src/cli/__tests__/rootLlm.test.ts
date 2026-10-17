import { mkdtemp } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it, vi } from "vitest"

import { resolveCliConfig } from "@/cli/config"
import { apiKeyEnv, createCliLlm, runCli } from "@/cli/root"
import { GeminiLlm } from "@/lib/llm/geminiLlm"
import { testCatalog } from "@/test/modelCatalog"

const constructed = vi.hoisted(() => vi.fn())

vi.mock("@/lib/llm/openAiLlm", () => ({
  OpenAiLlm: class {
    constructor(args: unknown) { constructed(args) }
    complete(): never { throw new Error("stop") }
  },
}))

describe("CLI root llm settings", () => {
  it("passes baseUrl, temperature and maxTokens to OpenAiLlm", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prepify-cli-"))
    const config = resolveCliConfig({ llm: { baseUrl: "http://localhost:1234/v1", temperature: 0.3, maxTokens: 2048 } })

    await runCli({ prepDir: dir, samplesRoot: `${dir}-samples`, apiKey: "unused", config }).catch(() => {})

    expect(constructed).toHaveBeenCalledWith({ apiKey: "unused", baseUrl: "http://localhost:1234/v1", temperature: 0.3, maxTokens: 2048 })
  })
})

describe("CLI provider selection", () => {
  const gemini = resolveCliConfig({ llm: { model: "gemini-3.1-flash-lite" } })
  const openai = resolveCliConfig({ llm: { model: "gpt-5-nano" } })
  const local = resolveCliConfig({ llm: { model: "local-model", baseUrl: "http://localhost:1234/v1" } })

  it("reads the key from the model's provider env var", () => {
    expect(apiKeyEnv(gemini, testCatalog)).toBe("GEMINI_API_KEY")
    expect(apiKeyEnv(openai, testCatalog)).toBe("OPENAI_API_KEY")
    expect(apiKeyEnv(local, testCatalog)).toBe("OPENAI_API_KEY")
  })

  it("builds a Gemini client only for Gemini models without a baseUrl", () => {
    expect(createCliLlm(gemini, "k", testCatalog)).toBeInstanceOf(GeminiLlm)
    expect(createCliLlm(openai, "k", testCatalog)).not.toBeInstanceOf(GeminiLlm)
    expect(createCliLlm(local, "k", testCatalog)).not.toBeInstanceOf(GeminiLlm)
  })

  it("fails on a model missing from the catalog", () => {
    expect(() => createCliLlm(resolveCliConfig({ llm: { model: "nope" } }), "k", testCatalog)).toThrow()
  })
})
