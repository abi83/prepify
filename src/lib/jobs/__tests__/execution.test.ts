import { describe, expect, it } from "vitest"

import { createInMemoryStore } from "@/core/inMemoryStore"
import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { executePrep, type ExecutionDeps, type ExecutionParams } from "@/lib/jobs/execution"
import type { PlanTarget, PrepState } from "@/lib/planner"

const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const TARGET: PlanTarget = { questionCount: 3, enabledTypes: [ "flashcard" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } }
const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

const concept = { id: "c1", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], language: "en" as const }

/** Simulates each job type's persisted effect on the state the planner sees. */
function fakeDeps(failType?: string) {
  const state: PrepState = { images: [ { id: "i1", ocrDone: false } ], concepts: [], prepMetaDone: false, questionCount: 0, questionJobCount: 0 }
  const ran: string[] = []
  let inFlight = 0
  let maxInFlight = 0

  const deps: ExecutionDeps = {
    // The in-memory store only resolves job ids as inputs; these inputs are entity ids.
    store: { ...createInMemoryStore(), existingIds: async (_actorId, ids) => new Set(ids) },
    llm: NOOP_LLM,
    progress: NOOP_PROGRESS,
    loadState: async () => ({ ...state }),
    definitionFor: async job => ({
      type: job.type,
      async run() {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise(resolve => setTimeout(resolve, 1))
        inFlight--
        if (job.type === failType) throw new Error("boom")
        ran.push(job.type)
        if (job.type === "ocr") state.images = [ { id: "i1", ocrDone: true } ]
        if (job.type === "concepts") state.concepts = [ concept ]
        if (job.type === "prep.meta") state.prepMetaDone = true
        if (job.type === "question") { state.questionCount++; state.questionJobCount++ }
        return { output: null, metas: [], wastedMetas: [] }
      },
    }),
  }
  return { deps, ran, maxInFlight: () => maxInFlight }
}

const params = (concurrency: number): ExecutionParams => ({
  actorId: "user-1", prepId: "prep-1", apiKey: "sk-test", signal: new AbortController().signal, config: CONFIG, target: TARGET, concurrency,
})

describe("executePrep", () => {
  it("chains OCR → concepts → prep.meta → question jobs until the target is met", async () => {
    const { deps, ran } = fakeDeps()
    await executePrep(deps, params(2))
    expect(ran).toEqual([ "ocr", "concepts", "prep.meta", "question", "question", "question" ])
  })

  it("never runs more jobs at once than the concurrency limit", async () => {
    const { deps, maxInFlight } = fakeDeps()
    await executePrep(deps, params(2))
    expect(maxInFlight()).toBe(2)
  })

  it("throws when a stage fails instead of re-planning it", async () => {
    const { deps, ran } = fakeDeps("concepts")
    await expect(executePrep(deps, params(2))).rejects.toThrow(/boom/)
    expect(ran).toEqual([ "ocr" ])
  })
})
