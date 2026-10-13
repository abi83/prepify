import type { Logger } from "@/core/logger"
import type { Llm } from "@/core/ports"
import type { StoredSample } from "@/core/sampler"
import { runAgent } from "@/lib/agent"
import { withConcurrency } from "@/lib/jobs/execution"
import { noopSampler } from "@/lib/sampler/noopSampler"
import { hashPrompt } from "@/lib/sampler/promptHash"

import { summarizeCell, type CellStats } from "./aggregate"
import { verdictSchema } from "./evaluator"
import { getEvaluator } from "./evaluators"
import type { Experiment } from "./experiment"
import type { ResultSink, SampleSource } from "./ports"

export interface CellSummary extends CellStats {
  cell: Experiment["cell"]
  evaluatorId: string
  judgeModel: string
  gitSha: string
  /** The sampling settings shared by every sample of the cell. */
  tier: string
  temperature: number
  maxTokens: number
}

export interface RunDeps {
  source: SampleSource
  sink: ResultSink
  llm: Llm
  logger: Logger
  gitSha: string
}

type SamplingSetting = "tier" | "temperature" | "maxTokens"

/** The value of `setting` shared by every sample; throws if samples differ, since one cell must compare like with like. */
function single<K extends SamplingSetting>(cell: Experiment["cell"], samples: StoredSample[], setting: K): StoredSample["meta"][K] {
  const counts = new Map<StoredSample["meta"][K], number>()
  for (const { meta } of samples) counts.set(meta[setting], (counts.get(meta[setting]) ?? 0) + 1)
  if (counts.size > 1) {
    const found = [ ...counts ].map(([ value, count ]) => `${value} (${count})`).join(", ")
    throw new Error(`Cell ${cell.agent}/${cell.promptHash}/${cell.model} mixes ${setting} values: ${found}. Put samples with different ${setting} in separate samples directories.`)
  }
  return samples[0].meta[setting]
}

/** Judges every sample of the experiment's cell, writes per-sample results and the cell summary. Judges up to `judge.concurrency` samples at once; any failure aborts. */
export async function runExperiment(experiment: Experiment, { source, sink, llm, logger, gitSha }: RunDeps): Promise<CellSummary> {
  const { cell, judge } = experiment
  const evaluator = getEvaluator(cell.agent)
  const evaluatorId = await hashPrompt(evaluator.systemPrompt)
  const samples = await source.readCell(cell)
  if (samples.length === 0) throw new Error(`No samples for cell ${cell.agent}/${cell.promptHash}/${cell.model}`)

  const sampling = { tier: single(cell, samples, "tier"), temperature: single(cell, samples, "temperature"), maxTokens: single(cell, samples, "maxTokens") }

  const deps = { llm, logger, sampler: noopSampler, timeoutMs: judge.timeoutMs }
  const signal = new AbortController().signal
  const settled = await withConcurrency(
    samples.map(sample => async () => {
      const { output } = await runAgent({
        name: `eval:${cell.agent}`,
        systemPrompt: evaluator.systemPrompt,
        userContent: evaluator.buildJudgeInput(sample),
        schema: verdictSchema,
        model: judge.llm.model,
        tier: judge.llm.tier,
        signal,
        deps,
      })
      await sink.writeSampleResult(cell, {
        executionId: sample.executionId,
        evaluatorId,
        judgeModel: judge.llm.model,
        score: output.score,
        reasoning: output.reasoning,
      })
      return { score: output.score, meta: sample.meta }
    }),
    judge.concurrency,
  )

  const failures = settled.flatMap((result, i) =>
    result.status === "rejected" ? [ `${samples[i].executionId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}` ] : [])
  if (failures.length > 0) throw new Error(`${failures.length} of ${samples.length} sample(s) failed:\n${failures.join("\n")}`)
  const rows = settled.flatMap(result => (result.status === "fulfilled" ? [ result.value ] : []))

  const summary: CellSummary = { cell, evaluatorId, judgeModel: judge.llm.model, gitSha, ...sampling, ...summarizeCell(rows) }
  await sink.writeSummary(cell, evaluatorId, summary)
  return summary
}
