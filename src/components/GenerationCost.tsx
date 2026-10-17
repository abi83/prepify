import { formatDate } from "@/lib/format"
import { formatCost } from "@/lib/pricing"
import type { GenerationCall, JobGeneration } from "@/repositories/prepStateRepository"

export function sumCalls(calls: GenerationCall[], field: "promptTokens" | "completionTokens" | "costUsd") {
  return calls.reduce((total, call) => total + call[field], 0)
}

/** Total tokens (in + out) and cost of `generations`, wasted calls included. */
export function totalsOf(generations: JobGeneration[]) {
  const calls = generations.flatMap(g => g.calls)
  return { promptTokens: sumCalls(calls, "promptTokens"), completionTokens: sumCalls(calls, "completionTokens"), costUsd: sumCalls(calls, "costUsd") }
}

export function formatTokens(tokens: number): string {
  return `${tokens.toLocaleString()} tokens`
}

/** "1,300 tokens · $0.002" */
export function formatUsage(tokens: number, costUsd: number): string {
  return `${formatTokens(tokens)} · ${formatCost(costUsd)}`
}

/** "1,000 in / 300 out" */
export function formatTokenSplit(promptTokens: number, completionTokens: number): string {
  return `${promptTokens.toLocaleString()} in / ${completionTokens.toLocaleString()} out`
}

/** Date of the job's latest call. */
export function generatedAtOf(generation: JobGeneration): Date {
  return new Date(Math.max(...generation.calls.map(call => call.generatedAt.getTime())))
}

function summaryOf(generation: JobGeneration, label?: string): string {
  return `${label ? `${label}: ` : ""}${generation.model} · ${formatCost(sumCalls(generation.calls, "costUsd"))}`
}

/** One job's `model · cost`, no details. */
export function GenerationCostLine({ generation, label }: { generation: JobGeneration; label?: string }) {
  return <span className="text-xs text-muted-foreground">{summaryOf(generation, label)}</span>
}

/** One job's `model · cost` (wasted calls included), expanding to tokens in/out, tier and date. */
export default function GenerationCost({ generation, label }: { generation: JobGeneration; label?: string }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">{summaryOf(generation, label)}</summary>
      <p className="mt-1">
        {formatTokenSplit(sumCalls(generation.calls, "promptTokens"), sumCalls(generation.calls, "completionTokens"))} · {generation.tier} · {formatDate(generatedAtOf(generation))}
      </p>
    </details>
  )
}
