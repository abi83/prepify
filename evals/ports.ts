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

export interface SampleSource {
  /** Every sample of the cell; throws on an invalid sample. */
  readCell(cell: Cell): Promise<StoredSample[]>
}

export interface ResultSink {
  writeSampleResult(cell: Cell, result: SampleResult): Promise<void>
  writeSummary(cell: Cell, promptHash: string, summary: unknown): Promise<void>
}
