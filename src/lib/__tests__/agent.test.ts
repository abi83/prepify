import { describe, expect, it } from "vitest"

import { sanitizeLLMText } from "../agent"

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
