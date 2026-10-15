import { formatCost } from "@/lib/pricing"
import type { ConceptGeneration, GenerationCall } from "@/repositories/prepStateRepository"

function sum(calls: GenerationCall[], field: "promptTokens" | "cachedTokens" | "completionTokens" | "costUsd" | "executionMs") {
  return calls.reduce((total, call) => total + call[field], 0)
}

function describeCalls(calls: GenerationCall[]): string {
  const tokens = [ "promptTokens", "cachedTokens", "completionTokens" ] as const
  const [ prompt, cached, completion ] = tokens.map(field => sum(calls, field).toLocaleString())
  return `${prompt} prompt / ${cached} cached / ${completion} completion tokens · ${formatCost(sum(calls, "costUsd"))} · ${(sum(calls, "executionMs") / 1000).toFixed(1)}s`
}

/** Generation cost of the concepts, one line per job; wasted calls are listed apart from the kept ones. */
export default function ConceptGenerationSummary({ generations }: { generations: ConceptGeneration[] }) {
  return (
    <section className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      <h3 className="font-bold tracking-wide uppercase">Concept generation</h3>
      <ul aria-label="Concept jobs" className="flex flex-col gap-1">
        {generations.map((g, i) => {
          const kept = g.calls.filter(c => !c.wasted)
          const wasted = g.calls.filter(c => c.wasted)
          return (
            <li key={g.jobId}>
              Job {i + 1} · {g.model} · {g.tier}: {describeCalls(kept)}
              {wasted.length > 0 && <> · wasted: {describeCalls(wasted)}</>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
