import { mkdir, mkdtemp, readdir, readFile } from "fs/promises"
import { tmpdir } from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { NonRetryableLlmError, type Llm, type LlmRequest } from "@/core/ports"
import { hashPrompt } from "@/lib/sampler/promptHash"
import { cellPrefix } from "@/lib/sampler/storedSample"
import { testCatalog } from "@/test/modelCatalog"
import { createDiskResultSink, createDiskSampleSource } from "@evals/diskAdapters"
import { ocrEvaluator } from "@evals/evaluators/ocr"
import type { Experiment } from "@evals/experiment"
import { formatSummary } from "@evals/format"
import { runExperiment } from "@evals/run"

import { CELL, makeSample, writeSamples } from "./fixtures"

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

function fakeJudge(scores: number[]) {
  const requests: LlmRequest[] = []
  const llm: Llm = {
    async complete(request) {
      const score = scores[requests.length]
      requests.push(request)
      return { content: JSON.stringify({ score, reasoning: `r${requests.length}` }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 32_000 }
    },
  }
  return { llm, requests }
}

async function setup(sampleCount: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "prepify-evals-run-"))
  const samples = Array.from({ length: sampleCount }, (_, i) => makeSample(i + 1))
  if (sampleCount > 0) await writeSamples(dir, samples)
  else await mkdir(path.join(dir, cellPrefix(CELL)), { recursive: true })
  const experiment: Experiment = {
    cell: CELL,
    samples: { dir },
    judge: { llm: { model: "big-judge", tier: "default" }, timeoutMs: 5000, concurrency: 2 },
    results: { dir },
  }
  return { dir, samples, experiment }
}

const deps = (dir: string, llm: Llm) => ({
  source: createDiskSampleSource(dir),
  sink: createDiskResultSink(dir),
  llm,
  logger: silent,
  catalog: testCatalog,
  gitSha: "abc123",
})

describe("runExperiment (OCR)", () => {
  it("judges each sample, writes results and a summary, shows the judge the images and output", async () => {
    const { dir, samples, experiment } = await setup(2)
    // concurrency:1 — this test checks per-sample scores by call order; parallel would be a race
    const sequentialExperiment = { ...experiment, judge: { ...experiment.judge, concurrency: 1 } }
    const { llm, requests } = fakeJudge([ 0.5, 1 ])

    const summary = await runExperiment(sequentialExperiment, deps(dir, llm))

    const promptHash = await hashPrompt(ocrEvaluator.prompt.text)
    const judgePrompt = { promptVersion: ocrEvaluator.prompt.version, promptHash }
    expect(summary).toMatchObject({ cell: CELL, agentPromptVersion: "1.0.0", ...judgePrompt, judgeModel: "big-judge", gitSha: "abc123", tier: "default", temperature: 1, maxTokens: 32_000, sampleCount: 2 })
    expect(summary.score).toEqual({ mean: 0.75, median: 0.75, p95: 1 })
    expect(summary.latencyMs.mean).toBe(1500)

    const resultDir = path.join(dir, "results", "ocr", CELL.promptHash, "org__model-x", promptHash)
    expect((await readdir(resultDir)).sort()).toEqual([ ...samples.map(s => `${s.executionId}.json`), "summary.json" ].sort())
    expect(JSON.parse(await readFile(path.join(resultDir, `${samples[0].executionId}.json`), "utf-8")))
      .toEqual({ executionId: samples[0].executionId, ...judgePrompt, judgeModel: "big-judge", score: 0.5, reasoning: "r1" })
    expect(JSON.parse(await readFile(path.join(resultDir, "summary.json"), "utf-8"))).toMatchObject({ gitSha: "abc123", tier: "default", temperature: 1, maxTokens: 32_000 })

    expect(requests[0].model).toBe("big-judge")
    expect(requests[0].responseFormat.name).toBe("eval:ocr")
    expect(requests[0].messages[1].content).toEqual([
      { type: "image", mimeType: "image/png", base64: "AAAA" },
      { type: "text", text: expect.stringContaining("\"text\": \"page 1\"") },
    ])
    expect(formatSummary(summary)).toContain("tier=default  temperature=1  maxTokens=32000  n=2")
  })

  it("never has more than `concurrency` judge calls in flight", async () => {
    const { dir, experiment } = await setup(6)
    let inFlight = 0
    let peak = 0
    const llm: Llm = {
      async complete() {
        peak = Math.max(peak, ++inFlight)
        await new Promise(resolve => setTimeout(resolve, 5))
        inFlight--
        return { content: JSON.stringify({ score: 0.5, reasoning: "r" }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 32_000 }
      },
    }

    const summary = await runExperiment(experiment, deps(dir, llm))

    expect(peak).toBe(2)
    expect(summary.sampleCount).toBe(6)
    expect(summary.score).toEqual({ mean: 0.5, median: 0.5, p95: 0.5 })
  })

  it("throws and writes no summary when a judge call fails", async () => {
    const { dir, experiment } = await setup(3)
    let calls = 0
    const llm: Llm = {
      async complete() {
        if (++calls >= 2) throw new NonRetryableLlmError("boom")
        return { content: JSON.stringify({ score: 1, reasoning: "r" }), promptTokens: 1, cachedTokens: 0, completionTokens: 1, temperature: 1, maxTokens: 32_000 }
      },
    }
    await expect(runExperiment(experiment, deps(dir, llm))).rejects.toThrow(/sample\(s\) failed/)
    const promptHash = await hashPrompt(ocrEvaluator.prompt.text)
    const resultDir = path.join(dir, "results", "ocr", CELL.promptHash, "org__model-x", promptHash)
    expect(await readdir(resultDir)).not.toContain("summary.json")
  })

  it("fails fast on a cell with zero samples", async () => {
    const { dir, experiment } = await setup(0)
    await expect(runExperiment(experiment, deps(dir, fakeJudge([]).llm))).rejects.toThrow(/No samples/)
  })

  it("fails fast when a cell mixes service tiers", async () => {
    const { dir, experiment } = await setup(0)
    const { meta } = makeSample(3)
    await writeSamples(dir, [ makeSample(1), makeSample(2), makeSample(3, { meta: { ...meta, tier: "flex" } }) ])
    const { llm, requests } = fakeJudge([])
    await expect(runExperiment(experiment, deps(dir, llm))).rejects.toThrow(/mixes tier values: default \(2\), flex \(1\).*separate samples directories/)
    expect(requests).toHaveLength(0)
  })

  it.each([
    [ "temperature", { temperature: 0.2 }, /mixes temperature values: 1 \(2\), 0.2 \(1\)/ ],
    [ "maxTokens", { maxTokens: 512 }, /mixes maxTokens values: 32000 \(2\), 512 \(1\)/ ],
  ])("fails fast when a cell mixes %s", async (_name, change, message) => {
    const { dir, experiment } = await setup(0)
    const { meta } = makeSample(3)
    await writeSamples(dir, [ makeSample(1), makeSample(2), makeSample(3, { meta: { ...meta, ...change } }) ])
    const { llm, requests } = fakeJudge([])
    await expect(runExperiment(experiment, deps(dir, llm))).rejects.toThrow(message)
    expect(requests).toHaveLength(0)
  })

  it("fails on an agent without an evaluator", async () => {
    const { dir, experiment } = await setup(1)
    const unknown = { ...experiment, cell: { ...CELL, agent: "nope" } }
    await expect(runExperiment(unknown, deps(dir, fakeJudge([]).llm))).rejects.toThrow(/No evaluator/)
  })
})
