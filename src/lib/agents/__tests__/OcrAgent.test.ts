import { beforeEach, describe, it, expect, vi } from "vitest"

const runAgent = vi.fn()
vi.mock("@/lib/agent", () => ({ runAgent: (...args: unknown[]) => runAgent(...args) }))

import { assertReadableText, runOcrAgent } from "@/lib/agents/OcrAgent"

const DEPS = {} as Parameters<typeof runOcrAgent>[4]

beforeEach(() => runAgent.mockReset())

describe("runOcrAgent", () => {
  it("returns the page title with the OCR output", async () => {
    const output = { title: "Chapter 3: Cells", text: "Mitosis divides a cell into two identical daughter cells.", confidence: 0.9, language: "en", visual_elements: [] }
    runAgent.mockResolvedValue({ output, meta: {} })

    const result = await runOcrAgent([], "m", "flex", new AbortController().signal, DEPS)

    expect(result.output.title).toBe("Chapter 3: Cells")
    expect(runAgent.mock.calls[0][0].schema.shape).toHaveProperty("title")
  })
})

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
