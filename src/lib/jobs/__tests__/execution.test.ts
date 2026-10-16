import { describe, expect, it } from "vitest"

import { createInMemoryStore } from "@/core/inMemoryStore"
import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import { executePrep, type ExecutionDeps, type ExecutionParams } from "@/lib/jobs/execution"
import type { PlanTarget, PrepState } from "@/lib/planner"
import type { PageConcepts } from "@/types/pipeline"

const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }
const TARGET: PlanTarget = { questionCount: 3, enabledTypes: [ "flashcard" ], difficultyMix: { easy: 1, medium: 0, hard: 0 } }
const NOOP_LLM: Llm = { complete: () => { throw new Error("not used") } }
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

const concept = { id: "c1", name: "Mitosis", description: "Cell division process in eukaryotes", importance: 0.9, misconceptions: [], language: "en" as const }

const FOUND: PageConcepts = { status: "found", concepts: [ concept ] }

/** Simulates each job type's persisted effect on the state the planner sees. */
function fakeDeps(failType?: string, extraction: PageConcepts = FOUND, pageIds = [ "i1" ]) {
  const state: PrepState = { images: pageIds.map(id => ({ id, ocrDone: false, concepts: { status: "pending" as const }, merge: "none" as const })), concepts: [], prepMetaDone: false, questionCount: 0, questionJobCount: 0, assetQuestionIds: [] }
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
        if (job.type === "asset") state.assetQuestionIds = []
        if (job.type === failType) throw new Error("boom")
        ran.push(job.type)
        const update = (patch: Partial<PrepState["images"][number]>) => {
          state.images = state.images.map(image => job.inputIds.includes(image.id) ? { ...image, ...patch } : image)
        }
        if (job.type === "ocr") update({ ocrDone: true })
        if (job.type === "concepts.extract") update({ concepts: extraction })
        if (job.type === "concepts") {
          update({ merge: "merged" })
          state.concepts = [ concept ]
        }
        if (job.type === "prep.meta") state.prepMetaDone = true
        if (job.type === "question") { state.questionCount++; state.questionJobCount++; state.assetQuestionIds = [ "q1" ] }
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
  it("chains OCR → concept extraction + prep.meta → concepts → question jobs until the target is met", async () => {
    const { deps, ran } = fakeDeps()
    await executePrep(deps, params(2))
    expect(ran).toEqual([ "ocr", "concepts.extract", "prep.meta", "concepts", "question", "question", "question", "asset" ])
  })

  it("merges each page in turn, after every extraction and before any question", async () => {
    const { deps, ran } = fakeDeps(undefined, FOUND, [ "i1", "i2", "i3" ])
    await executePrep(deps, params(5))
    expect(ran.filter(type => type === "concepts")).toHaveLength(3)
    expect(ran.lastIndexOf("concepts.extract")).toBeLessThan(ran.indexOf("concepts"))
    expect(ran.lastIndexOf("concepts")).toBeLessThan(ran.indexOf("question"))
  })

  it("plans an asset job per question needing one after the question jobs", async () => {
    const { deps, ran } = fakeDeps()
    await executePrep(deps, params(2))
    expect(ran.slice(-2)).toEqual([ "question", "asset" ])
  })

  it("completes when an asset job fails", async () => {
    const { deps } = fakeDeps("asset")
    await expect(executePrep(deps, params(2))).resolves.toBeUndefined()
  })

  it("never runs more jobs at once than the concurrency limit", async () => {
    const { deps, maxInFlight } = fakeDeps()
    await executePrep(deps, params(2))
    expect(maxInFlight()).toBe(2)
  })

  it("throws when a stage fails instead of re-planning it", async () => {
    const { deps, ran } = fakeDeps("concepts")
    await expect(executePrep(deps, params(2))).rejects.toThrow(/boom/)
    expect(ran).toEqual([ "ocr", "concepts.extract", "prep.meta" ])
  })

  it("throws once, without re-planning, when no page yields concepts", async () => {
    const { deps, ran } = fakeDeps(undefined, { status: "empty", reason: "not_educational" })
    await expect(executePrep(deps, params(2))).rejects.toThrow("No concepts found in any page (not_educational)")
    expect(ran).toEqual([ "ocr", "concepts.extract", "prep.meta" ])
  })
})
