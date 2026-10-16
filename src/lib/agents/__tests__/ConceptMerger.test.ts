import { beforeEach, describe, expect, it, vi } from "vitest"

const runAgent = vi.fn()
vi.mock("@/lib/agent", () => ({ runAgent: (...args: unknown[]) => runAgent(...args) }))

import { runConceptMerger } from "@/lib/agents/ConceptMerger"

const META = { model: "m", tier: "flex", temperature: 1, maxTokens: 1, promptTokens: 1, cachedTokens: 0, completionTokens: 1, totalTokens: 2, costUsd: 0, toolCalls: 0, executionMs: 1 }
const DEPS = {} as Parameters<typeof runConceptMerger>[5]

const concept = (name: string) => ({ name, description: "Cell division process in eukaryotes that yields two identical cells", importance: 0.8, misconceptions: [] })
const STORED = [ { ...concept("Mitosis"), id: "c1" }, { ...concept("Meiosis"), id: "c2" } ]

function merge(incoming: ReturnType<typeof concept>[]) {
  return runConceptMerger(incoming, STORED, "m", "flex", new AbortController().signal, DEPS)
}

beforeEach(() => runAgent.mockReset())

describe("runConceptMerger", () => {
  it("sends names and descriptions of both sets and maps each decision to the stored id it repeats", async () => {
    runAgent.mockResolvedValue({ output: { decisions: [ { name: "cell division", duplicateOf: "Mitosis" }, { name: "Cytokinesis", duplicateOf: null } ] }, meta: META })

    const { output } = await merge([ concept("cell division"), concept("Cytokinesis") ])

    expect(output).toEqual([ { concept: concept("cell division"), duplicateOfId: "c1" }, { concept: concept("Cytokinesis"), duplicateOfId: null } ])
    const sent = JSON.parse(runAgent.mock.calls[0][0].userContent.textContent)
    expect(sent.existing.map((c: { name: string }) => c.name)).toEqual([ "Mitosis", "Meiosis" ])
    expect(sent.incoming.map((c: { name: string }) => c.name)).toEqual([ "cell division", "Cytokinesis" ])
  })

  it("throws when an incoming concept has no decision", async () => {
    runAgent.mockResolvedValue({ output: { decisions: [] }, meta: META })

    await expect(merge([ concept("Cytokinesis") ])).rejects.toThrow("no decision for \"Cytokinesis\"")
  })

  it("throws when a duplicate points at a concept that isn't stored", async () => {
    runAgent.mockResolvedValue({ output: { decisions: [ { name: "Cytokinesis", duplicateOf: "Osmosis" } ] }, meta: META })

    await expect(merge([ concept("Cytokinesis") ])).rejects.toThrow("unknown \"Osmosis\"")
  })
})
