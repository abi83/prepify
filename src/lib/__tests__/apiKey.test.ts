import { beforeEach, describe, expect, it } from "vitest"

import { clearApiKey, getApiKey, setApiKey } from "@/lib/apiKey"

beforeEach(() => localStorage.clear())

describe("apiKey", () => {
  it("round-trips a gemini config", () => {
    setApiKey({ provider: "gemini", key: "AIza-x", model: "gemini-3.1-flash-lite", tier: "flex" })
    expect(getApiKey()).toEqual({ provider: "gemini", key: "AIza-x", model: "gemini-3.1-flash-lite", tier: "flex" })
  })

  it("reads a config saved before providers existed as openai", () => {
    localStorage.setItem("prepify_api_key", JSON.stringify({ key: "sk-x", model: "gpt-5-mini", tier: "flex" }))
    expect(getApiKey()?.provider).toBe("openai")
  })

  it("ignores a config with an unknown provider", () => {
    localStorage.setItem("prepify_api_key", JSON.stringify({ provider: "other", key: "k", model: "m", tier: "t" }))
    expect(getApiKey()).toBeNull()
  })

  it("clears the config", () => {
    setApiKey({ provider: "openai", key: "sk-x", model: "gpt-5-mini", tier: "flex" })
    clearApiKey()
    expect(getApiKey()).toBeNull()
  })
})
