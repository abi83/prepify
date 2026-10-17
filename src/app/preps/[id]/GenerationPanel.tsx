"use client"

import type { Prep, Question } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useCallback, useState, useRef } from "react"
import { toast } from "sonner"

import { retryTerminalJobs } from "@/actions/jobs"
import { getMyPrep, getPrepTokens } from "@/actions/preps"
import { listMyQuestions } from "@/actions/questions"
import { ExecutionModeDialog } from "@/components/ExecutionModeDialog"
import { GenerationConfigEditor } from "@/components/GenerationConfigEditor"
import { RunSettingsHint } from "@/components/RunSettingsHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { GenerationConfig } from "@/core/lib/generationConfig"
import { getGenerationConfig } from "@/core/lib/generationConfig"
import type { PlanTarget } from "@/core/lib/planner"
import { getApiKey } from "@/lib/apiKey"
import { getExecutionMode, isExecutionModeSet } from "@/lib/executionMode"
import { runGeneration as runJobGeneration, type GenerationProgress } from "@/lib/jobs/client/clientExecution"
import { requestServerRun } from "@/lib/jobs/client/serverRunClient"
import { consoleLogger } from "@/lib/logger"
import { clientSampler } from "@/lib/sampler/clientSampler"
import type { PrepProgress } from "@/repositories/prepStateRepository"

import { type GenPhase, rowsFromProgress, rowsFromSummary, ChecklistRow } from "./GenerationChecklist"
import { useRunProgress } from "./useRunProgress"

interface Props {
  prepId: string
  prepTitle: string
  initialProgress: PrepProgress | null
  hasQuestions: boolean
  onTitleReady: (title: string) => void
  onComplete: (questions: Question[], freshPrep: Prep) => void
}

export default function GenerationPanel({
  prepId,
  prepTitle,
  initialProgress,
  hasQuestions,
  onTitleReady,
  onComplete,
}: Props) {
  const router = useRouter()
  const { data: session } = useSession()
  const [ genPhase, setGenPhase ] = useState<GenPhase>("idle")
  const [ progress, setProgress ] = useState<GenerationProgress | null>(null)
  const [ localConfig, setLocalConfig ] = useState<GenerationConfig>(() => getGenerationConfig())
  const [ genMs, setGenMs ] = useState(0)
  const [ totalTokens, setTotalTokens ] = useState(0)
  const [ addCount, setAddCount ] = useState(5)
  const [ genError, setGenError ] = useState<string | null>(null)
  const [ modeDialogOpen, setModeDialogOpen ] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const genStartRef = useRef(0)
  const pendingActionRef = useRef<(() => Promise<void>) | null>(null)
  const handlePollError = useCallback((e: Error) => setGenError(e.message), [])
  const { progress: prepProgress, refresh: refreshProgress, expectRun } = useRunProgress(prepId, initialProgress, handlePollError)

  async function runOnServer(target: PlanTarget = localConfig) {
    const keyConfig = getApiKey()!
    setGenError(null)
    try {
      await requestServerRun({ apiKey: keyConfig.key, prepId, model: keyConfig.model, tier: keyConfig.tier, target })
      expectRun()
      await refreshProgress()
    } catch (e: unknown) {
      setGenError((e as Error).message)
    }
  }

  async function runInBrowser(target: PlanTarget = localConfig) {
    const keyConfig = getApiKey()!
    setGenError(null)
    setProgress(null)
    abortRef.current = new AbortController()
    genStartRef.current = performance.now()
    setGenPhase("running")

    let titleNotified = false
    try {
      const actorId = session?.user.id
      if (!actorId) throw new Error("Not signed in")
      const tokensBefore = await getPrepTokens(prepId)
      await runJobGeneration({
        actorId,
        prepId,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        tier: keyConfig.tier,
        target,
        signal: abortRef.current.signal,
        logger: consoleLogger,
        sampler: clientSampler,
        onProgress: event => {
          setProgress(event)
          // The `prep.meta` job has committed by the time questions start.
          if (event.stage === "questions" && !titleNotified) {
            titleNotified = true
            void getMyPrep(prepId)
              .then(fresh => onTitleReady(fresh.title))
              .catch(() => toast.error("Could not load the generated title"))
          }
        },
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)
      const savedQuestions = await listMyQuestions(prepId)

      const [ freshPrep, tokensAfter ] = await Promise.all([ getMyPrep(prepId), getPrepTokens(prepId) ])
      onComplete(savedQuestions, freshPrep)

      setGenMs(elapsed)
      setTotalTokens(tokensAfter - tokensBefore)
      setGenPhase("done")
      await refreshProgress()
      router.refresh()
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") setGenError((e as Error).message)
      setGenPhase("idle")
      await refreshProgress()
    }
  }

  function withModeCheck(action: () => Promise<void>) {
    if (!isExecutionModeSet()) {
      pendingActionRef.current = action
      setModeDialogOpen(true)
      return
    }
    void action()
  }

  function handleModeConfirm() {
    setModeDialogOpen(false)
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (action) void action()
  }

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${prepId}`)}`)
      return
    }
    withModeCheck(() => getExecutionMode() === "server" ? runOnServer() : runInBrowser())
  }

  async function handleResumeInterrupted() {
    if (!getApiKey()) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${prepId}`)}`)
      return
    }
    withModeCheck(() => getExecutionMode() === "server" ? runOnServer() : runInBrowser())
  }

  function handleAddMore() {
    if (!getApiKey()) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${prepId}`)}`)
      return
    }
    const target = { ...localConfig, additionalQuestions: addCount }
    withModeCheck(() => getExecutionMode() === "server" ? runOnServer(target) : runInBrowser(target))
  }

  async function handleRetryTerminal() {
    setGenError(null)
    try {
      await retryTerminalJobs(prepId)
      if (getExecutionMode() === "server") {
        await refreshProgress()
      } else {
        await runInBrowser()
      }
    } catch (e: unknown) {
      setGenError((e as Error).message)
    }
  }

  const isRunning = genPhase === "running"
  const hasPartialRun = prepProgress !== null
  const isServerRunning = prepProgress?.runState === "running"
  const isInterrupted = prepProgress?.runState === "interrupted"

  const hasUnfinishedJobs = prepProgress !== null && (
    prepProgress.runState !== "idle"
    || prepProgress.failedQuestions > 0
    || prepProgress.completedQuestions + prepProgress.failedQuestions + prepProgress.terminalQuestions < prepProgress.totalQuestions
  )

  if (hasQuestions && genPhase === "idle" && !genError) {
    return (
      <>
        <ExecutionModeDialog open={modeDialogOpen} onConfirm={handleModeConfirm} />
        <div className="flex flex-col gap-2.5">
          <GenerationConfigEditor value={localConfig} onChange={setLocalConfig} editCount={false} />
          <div className="flex flex-wrap items-center gap-2.5">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Add more</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={addCount}
              onChange={e => setAddCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              className="h-11 w-[84px]"
              aria-label="Number of questions to add"
            />
            <Button className="h-11" disabled={hasUnfinishedJobs} onClick={handleAddMore}>Add {addCount} more</Button>
            {hasUnfinishedJobs && <p className="text-sm text-muted-foreground">Resume the unfinished jobs first.</p>}
          </div>
          <RunSettingsHint returnTo={`/preps/${prepId}`} />
        </div>
      </>
    )
  }

  const checklistRows = isRunning
    ? rowsFromProgress(progress)
    : hasPartialRun ? rowsFromSummary(prepProgress, prepTitle) : null

  return (
    <>
      <ExecutionModeDialog open={modeDialogOpen} onConfirm={handleModeConfirm} />

      {!hasQuestions && (
        <div className="flex flex-col gap-3">
          {checklistRows ? (
            <>
              <div className="flex flex-col gap-2.5">
                {checklistRows.map(row => <ChecklistRow key={row.label} row={row} />)}
              </div>
              {!isRunning && !isServerRunning && (
                <>
                  <GenerationConfigEditor value={localConfig} onChange={setLocalConfig} editCount />
                  <RunSettingsHint returnTo={`/preps/${prepId}`} />
                </>
              )}
              <div className="mt-4 flex items-center gap-2.5">
                {isRunning ? (
                  <Button variant="outline" onClick={() => abortRef.current?.abort()}>Cancel</Button>
                ) : isServerRunning ? (
                  <p className="text-sm text-muted-foreground">Running on the server. You can close this tab.</p>
                ) : isInterrupted ? (
                  <>
                    <Button onClick={handleResumeInterrupted}>Resume</Button>
                    <p className="text-sm text-error">Interrupted. Resume to continue; finished steps are kept.</p>
                  </>
                ) : (
                  <Button onClick={handleGenerate}>
                    {hasPartialRun && (prepProgress.completedQuestions > 0 || prepProgress.failedQuestions > 0) ? "Resume generation" : "Start generation"}
                  </Button>
                )}
              </div>
              {!isRunning && !isServerRunning && prepProgress && prepProgress.terminalQuestions > 0 && (
                <div className="flex items-center gap-2.5">
                  <Button variant="outline" onClick={handleRetryTerminal}>Retry</Button>
                  <p className="text-sm text-error">
                    {prepProgress.terminalQuestions} question{prepProgress.terminalQuestions === 1 ? "" : "s"} failed repeatedly and won&apos;t be resumed automatically.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Generate study questions from this material.</p>

              <GenerationConfigEditor value={localConfig} onChange={setLocalConfig} editCount />

              <Button className="h-11 self-start" onClick={handleGenerate}>Generate questions</Button>
              <RunSettingsHint returnTo={`/preps/${prepId}`} />
            </>
          )}
        </div>
      )}

      {genError && (
        <div className="flex items-center gap-3 rounded-sm border border-error bg-error/10 px-4 py-3 text-sm text-error">
          <strong>Error:</strong> {genError}
          <Button variant="link" className="ml-auto h-auto p-0 text-xs text-error underline" onClick={() => { setGenError(null); setGenPhase("idle") }}>
            Retry
          </Button>
        </div>
      )}

      {genPhase === "done" && totalTokens > 0 && (
        <div className="text-xs text-muted-foreground">
          Generated in {(genMs / 1000).toFixed(1)}s · {totalTokens.toLocaleString()} tokens
        </div>
      )}

      {genPhase === "done" && prepProgress && prepProgress.failedQuestions > 0 && (
        <div className="text-xs text-error">
          {prepProgress.failedQuestions} question{prepProgress.failedQuestions === 1 ? "" : "s"} failed review twice and {prepProgress.failedQuestions === 1 ? "was" : "were"} skipped.
        </div>
      )}

    </>
  )
}
