import type { AgentMeta } from "@/core/sampler"

export interface Stats {
  mean: number
  median: number
  p95: number
}

export interface SampleMetrics {
  score: number
  meta: AgentMeta
}

/** Mean; median (mean of the two middle values for an even count); p95 by nearest rank: the value at 1-based rank ceil(0.95·n). */
export function computeStats(values: number[]): Stats {
  if (values.length === 0) throw new Error("Cannot aggregate zero values")
  const sorted = [ ...values ].sort((a, b) => a - b)
  const n = sorted.length
  const middle = Math.floor(n / 2)
  return {
    mean: sorted.reduce((sum, v) => sum + v, 0) / n,
    median: n % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(0.95 * n) - 1],
  }
}

export interface CellStats {
  sampleCount: number
  score: Stats
  latencyMs: Stats
  promptTokens: Stats
  completionTokens: Stats
  totalTokens: Stats
  costUsd: Stats
}

export function summarizeCell(rows: SampleMetrics[]): CellStats {
  if (rows.length === 0) throw new Error("Cannot summarize a cell with zero samples")
  const stats = (pick: (row: SampleMetrics) => number) => computeStats(rows.map(pick))
  return {
    sampleCount: rows.length,
    score: stats(row => row.score),
    latencyMs: stats(row => row.meta.executionMs),
    promptTokens: stats(row => row.meta.promptTokens),
    completionTokens: stats(row => row.meta.completionTokens),
    totalTokens: stats(row => row.meta.totalTokens),
    costUsd: stats(row => row.meta.costUsd),
  }
}
