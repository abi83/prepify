import type { Logger } from "@/core/logger"
import type { Llm } from "@/core/ports"
import type { StoredSample } from "@/core/sampler"
import { runAgent } from "@/lib/agent"
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
  /** The sampling service tier shared by every sample of the cell. */
  tier: string
}

export interface RunDeps {
  source: SampleSource
  sink: ResultSink
  llm: Llm
  logger: Logger
  gitSha: string
}

function singleTier(cell: Experiment["cell"], samples: StoredSample[]): string {
  const counts = new Map<string, number>()
  for (const { meta } of samples) counts.set(meta.tier, (counts.get(meta.tier) ?? 0) + 1)
  if (counts.size > 1) {
    const found = [ ...counts ].map(([ tier, count ]) => `${tier} (${count})`).join(", ")
    throw new Error(`Cell ${cell.agent}/${cell.promptHash}/${cell.model} mixes service tiers: ${found}. Put samples of different tiers in separate samples directories.`)
  }
  return samples[0].meta.tier
}

/** Judges every sample of the experiment's cell, writes per-sample results and the cell summary. Sequential; any failure aborts. */
export async function runExperiment(experiment: Experiment, { source, sink, llm, logger, gitSha }: RunDeps): Promise<CellSummary> {
  const { cell, judge } = experiment
  const evaluator = getEvaluator(cell.agent)
  const evaluatorId = await hashPrompt(evaluator.systemPrompt)
  const samples = await source.readCell(cell)
  if (samples.length === 0) throw new Error(`No samples for cell ${cell.agent}/${cell.promptHash}/${cell.model}`)

  const tier = singleTier(cell, samples)

  const deps = { llm, logger, sampler: noopSampler, timeoutMs: judge.timeoutMs }
  const signal = new AbortController().signal
  const rows = []
  for (const sample of samples) {
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
    rows.push({ score: output.score, meta: sample.meta })
  }

  const summary: CellSummary = { cell, evaluatorId, judgeModel: judge.llm.model, gitSha, tier, ...summarizeCell(rows) }
  await sink.writeSummary(cell, evaluatorId, summary)
  return summary
}
