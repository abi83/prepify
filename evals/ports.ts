import type { StoredSample } from "@/core/sampler"

/** One agent × prompt × model combination — exactly one sample prefix. */
export interface Cell {
  agent: string
  promptHash: string
  model: string
}

export interface SampleResult {
  executionId: string
  metric: string
  /** The judge prompt. */
  promptVersion: string
  promptHash: string
  judgeModel: string
  score: number
  reasoning: string
}

/** One judge: its model and rubric hash. Both identify a result; the same rubric under another model is a different judge. */
export interface JudgeId {
  model: string
  promptHash: string
}

/** `{judge model}/{judge promptHash}`, with `/` in the model id made `__` like sample paths do. */
export const judgePath = ({ model, promptHash }: JudgeId): string => `${model.replace(/\//g, "__")}/${promptHash}`

export interface SampleSource {
  /** Every sample of the cell; throws on an invalid sample. */
  readCell(cell: Cell): Promise<StoredSample[]>
}

export interface ResultSink {
  writeSampleResult(cell: Cell, result: SampleResult): Promise<void>
  writeSummary(cell: Cell, judge: JudgeId, summary: unknown): Promise<void>
}
