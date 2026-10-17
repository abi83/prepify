import { formatCost } from "@/lib/pricing"
import type { GenerationCall, JobGeneration } from "@/repositories/prepStateRepository"

function sum(calls: GenerationCall[], field: "promptTokens" | "completionTokens" | "costUsd") {
  return calls.reduce((total, call) => total + call[field], 0)
}

/** "1,300 tokens · $0.002" — total tokens (in + out) and cost. */
export function formatUsage(tokens: number, costUsd: number): string {
  return `${tokens.toLocaleString()} tokens · ${formatCost(costUsd)}`
}

/** Cost of `generations`, wasted calls included: a summary line that expands to model · tier · in/out tokens · cost per job. A `label` prefixes the summary. */
export default function GenerationCost({ generations, label }: { generations: JobGeneration[]; label?: string }) {
  const calls = generations.flatMap(g => g.calls)
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">{label && `${label}: `}{formatUsage(sum(calls, "promptTokens") + sum(calls, "completionTokens"), sum(calls, "costUsd"))}</summary>
      <ul className="mt-1 flex flex-col gap-0.5">
        {generations.map(g => (
          <li key={g.jobId}>
            {g.model} · {g.tier} · {sum(g.calls, "promptTokens").toLocaleString()} in / {sum(g.calls, "completionTokens").toLocaleString()} out · {formatCost(sum(g.calls, "costUsd"))}
          </li>
        ))}
      </ul>
    </details>
  )
}
