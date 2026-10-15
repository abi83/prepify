import { describe, expect, it, vi } from "vitest"

const routeAsset = vi.fn()
vi.mock("@/lib/agents/assets/assetRouter", () => ({ routeAsset: (...args: unknown[]) => routeAsset(...args) }))

import type { JobDeps } from "@/core/ports"
import type { JobRunContext } from "@/core/runJob"
import { createAssetJobDefinition } from "@/lib/jobs/assetJob"
import { consoleLogger } from "@/lib/logger"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { testCatalog } from "@/test/modelCatalog"

const META = { model: "gpt-5-nano", tier: "flex", promptTokens: 10, cachedTokens: 0, completionTokens: 5, totalTokens: 15, costUsd: 0.001, toolCalls: 0, executionMs: 123 }
const DEPS: JobDeps = { llm: { complete: () => { throw new Error("not used") } }, logger: consoleLogger, sampler: noopSampler, catalog: testCatalog }
const CTX = {
  job: { id: "job-1", type: "asset", inputIds: [ "q1" ], config: { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }, question: null },
  signal: new AbortController().signal,
} as unknown as JobRunContext

const content = (asset_hint: unknown) => ({ id: "q1", content: { front: "f", asset_hint } })

describe("createAssetJobDefinition", () => {
  it("routes the question's asset hint and returns the blob with its meta", async () => {
    routeAsset.mockResolvedValue({ output: { type: "formula", blob: "<svg></svg>" }, meta: META })
    const definition = createAssetJobDefinition(content({ needed: true, type: "formula", description: "E=mc^2" }), DEPS)

    const result = await definition.run(CTX)

    expect(routeAsset).toHaveBeenCalledWith({ needed: true, type: "formula", description: "E=mc^2" }, "gpt-5-nano", "flex", CTX.signal, { ...DEPS, timeoutMs: 1000 })
    expect(result).toEqual({ output: { type: "formula", blob: "<svg></svg>" }, metas: [ META ], wastedMetas: [] })
  })

  it("throws for a question that needs no asset", async () => {
    const definition = createAssetJobDefinition(content({ needed: false, type: null, description: null }), DEPS)

    await expect(definition.run(CTX)).rejects.toThrow(/needs no asset/)
  })
})
