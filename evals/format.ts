import type { Stats } from "./aggregate"
import type { CellSummary } from "./run"

const ROWS: { label: string; pick: (s: CellSummary) => Stats; digits: number }[] = [
  { label: "score", pick: s => s.score, digits: 3 },
  { label: "latency ms", pick: s => s.latencyMs, digits: 0 },
  { label: "prompt tokens", pick: s => s.promptTokens, digits: 0 },
  { label: "completion tokens", pick: s => s.completionTokens, digits: 0 },
  { label: "total tokens", pick: s => s.totalTokens, digits: 0 },
  { label: "cost usd", pick: s => s.costUsd, digits: 5 },
]

export function formatSummary(summary: CellSummary): string {
  const { cell } = summary
  const header = `${cell.agent}/${cell.promptHash.slice(0, 8)}/${cell.model}  tier=${summary.tier}  temperature=${summary.temperature}  maxTokens=${summary.maxTokens}  n=${summary.sampleCount}  judge=${summary.judgeModel}  evaluator=${summary.evaluatorId.slice(0, 8)}`
  const lines = ROWS.map(({ label, pick, digits }) => {
    const { mean, median, p95 } = pick(summary)
    return `${label.padEnd(18)}${mean.toFixed(digits).padStart(12)}${median.toFixed(digits).padStart(12)}${p95.toFixed(digits).padStart(12)}`
  })
  return [ header, `${"".padEnd(18)}${"mean".padStart(12)}${"median".padStart(12)}${"p95".padStart(12)}`, ...lines ].join("\n")
}
