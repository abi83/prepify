import { beforeEach, describe, expect, it, vi } from "vitest"

const runAgent = vi.fn()
vi.mock("@/lib/agent", () => ({ runAgent: (...args: unknown[]) => runAgent(...args) }))

import { MAX_PAGE_CHARS } from "@/core/lib/config"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import { conceptsResponseSchema } from "@/types/pipeline"

const META = { model: "m", tier: "flex", temperature: 1, maxTokens: 1, promptTokens: 1, cachedTokens: 0, completionTokens: 1, totalTokens: 2, costUsd: 0, toolCalls: 0, executionMs: 1 }
const DEPS = {} as Parameters<typeof runConceptExtractor>[5]
const PAGE = { page: 1, title: "Cells", language: "de" as const, text: "Mitosis divides a cell.", gcsKey: "k", visual_elements: [] }

const concept = (name: string, importance: number) => ({ name, description: "Cell division process in eukaryotes that yields two identical cells", importance, misconceptions: [] })

function extract(page = PAGE) {
  return runConceptExtractor(page, "m", "flex", "de", new AbortController().signal, DEPS)
}

beforeEach(() => runAgent.mockReset())

describe("runConceptExtractor", () => {
  it("makes one call for the page and stamps its language on the concepts it keeps", async () => {
    runAgent.mockResolvedValue({ output: { concepts: [ concept("Mitosis", 0.9), concept("Footnote", 0.2) ], emptyReason: null }, meta: META })

    const { output } = await extract()

    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(output).toEqual({ status: "found", concepts: [ { ...concept("Mitosis", 0.9), language: "de" } ] })
  })

  it("reports the model's reason when it finds nothing", async () => {
    runAgent.mockResolvedValue({ output: { concepts: [], emptyReason: "not_educational" }, meta: META })

    expect((await extract()).output).toEqual({ status: "empty", reason: "not_educational" })
  })

  it("reports no_assessable_content when every concept falls below the importance cutoff", async () => {
    runAgent.mockResolvedValue({ output: { concepts: [ concept("Footnote", 0.2) ], emptyReason: null }, meta: META })

    expect((await extract()).output).toEqual({ status: "empty", reason: "no_assessable_content" })
  })

  it("throws on a page over the size limit without calling the model", async () => {
    await expect(extract({ ...PAGE, text: "x".repeat(MAX_PAGE_CHARS) })).rejects.toThrow("over the 15000 limit")
    expect(runAgent).not.toHaveBeenCalled()
  })
})

describe("conceptsResponseSchema", () => {
  it("requires emptyReason exactly when concepts is empty", () => {
    expect(conceptsResponseSchema.safeParse({ concepts: [], emptyReason: null }).success).toBe(false)
    expect(conceptsResponseSchema.safeParse({ concepts: [], emptyReason: "unreadable" }).success).toBe(true)
    expect(conceptsResponseSchema.safeParse({ concepts: [ concept("Mitosis", 0.9) ], emptyReason: "unreadable" }).success).toBe(false)
    expect(conceptsResponseSchema.safeParse({ concepts: [ concept("Mitosis", 0.9) ], emptyReason: null }).success).toBe(true)
  })
})
