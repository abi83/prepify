import { useState } from "react"

import { retryJob } from "@/actions/jobs"
import GenerationPanel from "@/app/preps/[id]/GenerationPanel"
import { resumeRunRequest, useRunTrigger } from "@/app/preps/[id]/useRunTrigger"
import { ExecutionModeDialog } from "@/components/ExecutionModeDialog"
import { formatTokenSplit, generatedAtOf, GenerationCostLine, totalsOf } from "@/components/GenerationCost"
import { Button } from "@/components/ui/button"
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

interface RetryProps {
  retrying: boolean
  onRetry: (jobId: string) => void
}

function LogRow({ generation: g, retrying, onRetry }: RetryProps & { generation: JobGeneration }) {
  const { promptTokens, completionTokens } = totalsOf([ g ])
  return (
    <tr className="border-t border-border align-top">
      <td className="py-1.5 pr-3">{jobTypeLabel(g.type)}{g.subject && <span className="text-muted-foreground"> · {g.subject}</span>}</td>
      <td className="py-1.5 pr-3">
        {g.status}
        {g.status === "failed" && (
          <>
            {g.failureReason && <span className="block max-w-xs text-error">{g.failureReason}</span>}
            <Button variant="outline" size="sm" className="mt-1" disabled={retrying} onClick={() => onRetry(g.jobId)}>Retry</Button>
          </>
        )}
      </td>
      <td className="py-1.5 pr-3"><GenerationCostLine generation={g} /></td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{formatTokenSplit(promptTokens, completionTokens)}</td>
      <td className="py-1.5 whitespace-nowrap">{formatDate(generatedAtOf(g))}</td>
    </tr>
  )
}

function GenerationLog({ generations, retrying, onRetry }: RetryProps & { generations: JobGeneration[] }) {
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
          {chronological(generations).map(g => <LogRow key={g.jobId} generation={g} retrying={retrying} onRetry={onRetry} />)}
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

export default function GenerationTab({ prep, questions, progress, generations, onTitleReady, onGenerated }: PrepTabProps) {
  const jobs = Object.values(generations)
  const [ retrying, setRetrying ] = useState(false)
  const [ error, setError ] = useState("")
  const trigger = useRunTrigger(prep.id, {
    onError: message => {
      setRetrying(false)
      setError(message)
    },
    onFinished: () => setRetrying(false),
  })

  async function retry(jobId: string) {
    setError("")
    setRetrying(true)
    try {
      await retryJob(jobId)
    } catch (e) {
      setRetrying(false)
      setError(e instanceof Error ? e.message : "Failed to retry")
      return
    }
    trigger.run(resumeRunRequest(prep.id))
  }

  return (
    <div className="flex flex-col gap-6">
      <ExecutionModeDialog open={trigger.modeDialogOpen} onConfirm={trigger.confirmMode} />
      <GenerationPanel
        prepId={prep.id}
        prepTitle={prep.title}
        initialProgress={progress}
        hasQuestions={questions.length > 0}
        onTitleReady={onTitleReady}
        onComplete={onGenerated}
      />
      <section className="flex flex-col gap-1.5">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Generation log</h2>
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        {jobs.length === 0
          ? <p className="text-sm text-muted-foreground">No generation jobs yet.</p>
          : <GenerationLog generations={jobs} retrying={retrying} onRetry={retry} />}
      </section>
    </div>
  )
}
