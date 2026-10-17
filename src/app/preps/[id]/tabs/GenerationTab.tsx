import GenerationPanel from "@/app/preps/[id]/GenerationPanel"
import { formatTokenSplit, generatedAtOf, GenerationCostLine, totalsOf } from "@/components/GenerationCost"
import { formatDate } from "@/lib/format"
import { formatCost } from "@/lib/pricing"
import type { JobGeneration } from "@/repositories/prepStateRepository"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/types/jobTypes"

import type { PrepTabProps } from "./types"

const JOB_TYPE_LABELS: Record<string, string> = {
  [OCR_JOB_TYPE]: "OCR",
  [CONCEPTS_EXTRACT_JOB_TYPE]: "Concept extraction",
  [CONCEPTS_JOB_TYPE]: "Concepts",
  [PREP_META_JOB_TYPE]: "Title",
  [QUESTION_JOB_TYPE]: "Question",
  [ASSET_JOB_TYPE]: "Asset",
}

function jobTypeLabel(type: string): string {
  const label = JOB_TYPE_LABELS[type]
  if (label === undefined) throw new Error(`Unknown job type "${type}"`)
  return label
}

/** Jobs oldest first, by their latest call. */
function chronological(generations: JobGeneration[]): JobGeneration[] {
  return [ ...generations ].sort((a, b) => generatedAtOf(a).getTime() - generatedAtOf(b).getTime())
}

function LogRow({ generation: g }: { generation: JobGeneration }) {
  const { promptTokens, completionTokens } = totalsOf([ g ])
  return (
    <tr className="border-t border-border align-top">
      <td className="py-1.5 pr-3">{jobTypeLabel(g.type)}{g.subject && <span className="text-muted-foreground"> · {g.subject}</span>}</td>
      <td className="py-1.5 pr-3">{g.status}</td>
      <td className="py-1.5 pr-3"><GenerationCostLine generation={g} /></td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{formatTokenSplit(promptTokens, completionTokens)}</td>
      <td className="py-1.5 whitespace-nowrap">{formatDate(generatedAtOf(g))}</td>
    </tr>
  )
}

function GenerationLog({ generations }: { generations: JobGeneration[] }) {
  const { promptTokens, completionTokens, costUsd } = totalsOf(generations)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-semibold">Job</th>
            <th className="py-1 pr-3 font-semibold">Status</th>
            <th className="py-1 pr-3 font-semibold">Model · cost</th>
            <th className="py-1 pr-3 font-semibold">Tokens</th>
            <th className="py-1 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody>
          {chronological(generations).map(g => <LogRow key={g.jobId} generation={g} />)}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="py-1.5 pr-3" colSpan={2}>Total</td>
            <td className="py-1.5 pr-3">{formatCost(costUsd)}</td>
            <td className="py-1.5 pr-3 whitespace-nowrap">{formatTokenSplit(promptTokens, completionTokens)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default function GenerationTab({ prep, questions, progress, refreshProgress, expectRun, generations, onTitleReady, onGenerated }: PrepTabProps) {
  const jobs = Object.values(generations)
  return (
    <div className="flex flex-col gap-6">
      <GenerationPanel
        prepId={prep.id}
        prepTitle={prep.title}
        progress={progress}
        refreshProgress={refreshProgress}
        expectRun={expectRun}
        hasQuestions={questions.length > 0}
        onTitleReady={onTitleReady}
        onComplete={onGenerated}
      />
      <section className="flex flex-col gap-1.5">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Generation log</h2>
        {jobs.length === 0
          ? <p className="text-sm text-muted-foreground">No generation jobs yet.</p>
          : <GenerationLog generations={jobs} />}
      </section>
    </div>
  )
}
