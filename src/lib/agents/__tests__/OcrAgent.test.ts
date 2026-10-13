import { describe, it, expect } from "vitest"

import { assertReadableText } from "@/lib/agents/OcrAgent"

describe("assertReadableText", () => {
  it("accepts a normal paragraph", () => {
    expect(() => assertReadableText("La photosynthèse est le processus par lequel les plantes produisent de l'énergie.")).not.toThrow()
  })

  it("accepts prose with some digits and symbols", () => {
    expect(() => assertReadableText("Le poids vaut P = m · g, soit 9,81 N pour une masse de 1 kg.")).not.toThrow()
  })

  it.each([ "", "   ", "{" ])("rejects too-short text %j", text => {
    expect(() => assertReadableText(text)).toThrow(/^ocr_text_too_short:/)
  })

  it.each([ "{".repeat(40), "1234567890 ".repeat(5), "... --- ,,, ;;; !!! ??? ((( )))" ])(
    "rejects non-letter text %j",
    text => {
      expect(() => assertReadableText(text)).toThrow(/^ocr_text_not_letters:/)
    },
  )
})
