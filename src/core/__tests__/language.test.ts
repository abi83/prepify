import { Language } from "@prisma/client"
import { describe, expect, it } from "vitest"

import { resolveLanguage } from "@/core/lib/language"
import { SUPPORTED_LANGUAGES } from "@/types/language"

describe("resolveLanguage", () => {
  it("returns the shared language", () => {
    expect(resolveLanguage([ { language: "de" }, { language: "de" } ])).toBe("de")
  })

  it("throws on mixed languages", () => {
    expect(() => resolveLanguage([ { language: "de" }, { language: "fr" } ])).toThrow("more than one language: de, fr")
  })

  it("throws on no inputs", () => {
    expect(() => resolveLanguage([])).toThrow("no inputs")
  })
})

describe("Language enum", () => {
  it("matches SUPPORTED_LANGUAGES", () => {
    expect(Object.values(Language).sort()).toEqual([ ...SUPPORTED_LANGUAGES ].sort())
  })
})
