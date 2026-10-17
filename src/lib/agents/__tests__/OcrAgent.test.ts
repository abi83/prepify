import { beforeEach, describe, it, expect, vi } from "vitest"

const runAgent = vi.fn()
vi.mock("@/lib/agent", async importActual => ({ ...await importActual<typeof import("@/lib/agent")>(), runAgent: (...args: unknown[]) => runAgent(...args) }))

import { assertReadableText, OcrRejectedError, runOcrAgent } from "@/lib/agents/OcrAgent"

const DEPS = {} as Parameters<typeof runOcrAgent>[4]

beforeEach(() => runAgent.mockReset())

describe("runOcrAgent readability gate", () => {
  const rejectedOutput = { title: "t", text: "1 + 2 = 3 | 4 - 5 = 6 | 7 * 8 = 9 | ~ ~ ~ ~ ~ ~ ~ ~ ~", confidence: 0.9, language: "de", visual_elements: [] }

  it("warns with the code and the text, then rethrows the same error", async () => {
    const warn = vi.fn()
    runAgent.mockResolvedValue({ output: rejectedOutput, meta: {} })

    const run = runOcrAgent([], "m", "flex", new AbortController().signal, { logger: { warn } } as unknown as Parameters<typeof runOcrAgent>[4])

    await expect(run).rejects.toThrow(/^ocr_text_not_letters:/)
    expect(warn).toHaveBeenCalledWith("agent:ocr: page text rejected", expect.objectContaining({
      text: rejectedOutput.text,
      error: expect.objectContaining({ message: expect.stringMatching(/^ocr_text_not_letters:/) }),
    }))
  })

  it("carries the wasted call's meta on the thrown error", async () => {
    const meta = { promptTokens: 7 }
    runAgent.mockResolvedValue({ output: rejectedOutput, meta })

    const error = await runOcrAgent([], "m", "flex", new AbortController().signal, { logger: { warn: vi.fn() } } as unknown as Parameters<typeof runOcrAgent>[4]).catch(e => e)

    expect(error).toBeInstanceOf(OcrRejectedError)
    expect(error.meta).toBe(meta)
  })

  it("truncates a long rejected text in the warn", async () => {
    const warn = vi.fn()
    runAgent.mockResolvedValue({ output: { ...rejectedOutput, text: "~".repeat(5000) }, meta: {} })

    await expect(runOcrAgent([], "m", "flex", new AbortController().signal, { logger: { warn } } as unknown as Parameters<typeof runOcrAgent>[4])).rejects.toThrow()

    expect(warn.mock.calls[0][1].text).toHaveLength(2000 + "… [truncated, 5000 chars]".length)
  })
})

describe("runOcrAgent", () => {
  it("returns the page title with the OCR output", async () => {
    const output = { title: "Chapter 3: Cells", text: "Mitosis divides a cell into two identical daughter cells.", confidence: 0.9, language: "en", visual_elements: [] }
    runAgent.mockResolvedValue({ output, meta: {} })

    const result = await runOcrAgent([], "m", "flex", new AbortController().signal, DEPS)

    expect(result.output.title).toBe("Chapter 3: Cells")
    expect(runAgent.mock.calls[0][0].schema.shape).toHaveProperty("title")
  })
})

const MATH_EXERCISE_PAGE = `10 Gib die größere der beiden Zahlen an. Begründe deine Entscheidung. Überprüfe anschließend mit deinem Taschenrechner.
a) 3² ; 3^(1/3)   b) 2^(1/3) ; 2^(−1/2)   c) 7^(2/3) ; 7^(3/2)   d) 5^(−2) ; 5^(−1/2)
e) 2^(1/3) ; 3^(1/3)   f) 2^(−1/3) ; 3^(−1/3)   g) (−3)^(−1/3) ; 3^(−1/3)   h) (−3)^(−1/3) ; (−2)^(−1/3)
11 In welcher Beziehung stehen die Zahlen zueinander? Übertrage die Tabelle in dein Heft und ergänze sie mit den angegebenen Zahlenpaaren.
Die Zahlen sind ... gleich. Zahl und deren Kehrwert. Gegenzahlen zueinander. Zahl und deren Quadratzahl.
a) (−2)³ ; 64^(1/2)   b) 2^(1/2) ; 1/√2   c) 3^(2/3) ; ∛9   d) 3^(−2) ; 1/81
e) 1/√125 ; 5^(3/2)   f) 2^(−1/3) ; 2^(−2/3)   g) (−1/7)² ; 49^(−1)   h) (−5)^(−3) ; (1/5)³
12 Gib jeweils an, zwischen welchen beiden natürlichen Zahlen der Term liegt. Beispiel: 4 < √23 < 5
a) √10 ; ∛10 ; ∜10 ; ⁵√10 ; ¹⁰⁰√10
b) √100 ; ∛100 ; ∜100 ; ⁵√100 ; ¹⁰⁰√100
c) ∛10 ; ∛100 ; ∛1000 ; ∛10 000 ; ∛100 000
13 Schreibe jeweils als Potenz mit möglichst kleiner natürlicher Basis.
a) ⁵√16   b) ¹⁰√256   c) ⁹√0,008   d) ⁴√25   e) ¹²√(16/640)   f) ⁴√32   g) ⁶√27   h) ⁵√1000`

describe("assertReadableText", () => {
  it("accepts a math exercise page where digits and symbols dominate", () => {
    expect(() => assertReadableText(MATH_EXERCISE_PAGE)).not.toThrow()
  })

  it("accepts a normal paragraph", () => {
    expect(() => assertReadableText("La photosynthèse est le processus par lequel les plantes produisent de l'énergie.")).not.toThrow()
  })

  it("accepts prose with some digits and symbols", () => {
    expect(() => assertReadableText("Le poids vaut P = m · g, soit 9,81 N pour une masse de 1 kg.")).not.toThrow()
  })

  it.each([ "", "   ", "{" ])("rejects too-short text %j", text => {
    expect(() => assertReadableText(text)).toThrow(/^ocr_text_too_short:/)
  })

  it.each([ "{".repeat(40), "1234567890 ".repeat(5), "... --- ,,, ;;; !!! ??? ((( )))", "|~=|~=|~=|~=|~=|~=|~=|~=", "| | ~ ~ = = + + | | ~ ~ 1 2 3 4", "\u0000\u0001\u0002".repeat(10) ])(
    "rejects non-letter text %j",
    text => {
      expect(() => assertReadableText(text)).toThrow(/^ocr_text_not_letters:/)
    },
  )
})
