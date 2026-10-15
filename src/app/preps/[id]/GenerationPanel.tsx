"use client"

import type { Prep, Question } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useCallback, useState, useRef } from "react"

import { retryTerminalJobs } from "@/actions/jobs"
import { getMyPrep, getPrepTokens } from "@/actions/preps"
import { listMyQuestions } from "@/actions/questions"
import { AdditionalSettings } from "@/components/AdditionalSettings"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiKey } from "@/lib/apiKey"
import { getExecutionMode, type ExecutionMode } from "@/lib/executionMode"
import type { GenerationConfig } from "@/lib/generationConfig"
import { getGenerationConfig, ALL_QUESTION_TYPES, TYPE_LABELS } from "@/lib/generationConfig"
import { runGeneration as runJobGeneration, type GenerationProgress } from "@/lib/jobs/clientExecution"
import { requestServerRun } from "@/lib/jobs/serverRunClient"
import { consoleLogger } from "@/lib/logger"
import { clientSampler } from "@/lib/sampler/clientSampler"
import { cn } from "@/lib/utils"
import type { PrepProgress } from "@/repositories/prepStateRepository"
import type { QuestionType } from "@/types/questions"

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
  const [ executionMode, setExecutionMode ] = useState<ExecutionMode>(() => getExecutionMode())
  const [ localConfig, setLocalConfig ] = useState<GenerationConfig>(() => getGenerationConfig())
  const [ genConfigOpen, setGenConfigOpen ] = useState(false)
  const [ genMs, setGenMs ] = useState(0)
  const [ totalTokens, setTotalTokens ] = useState(0)
  const [ genError, setGenError ] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const genStartRef = useRef(0)
  const handlePollError = useCallback((e: Error) => setGenError(e.message), [])
  const { progress: prepProgress, refresh: refreshProgress, expectRun } = useRunProgress(prepId, initialProgress, handlePollError)

  function toggleLocalType(type: QuestionType) {
    setLocalConfig(prev => {
      const already = prev.enabledTypes.includes(type)
      if (already && prev.enabledTypes.length === 1) return prev
      return { ...prev, enabledTypes: already ? prev.enabledTypes.filter(t => t !== type) : [ ...prev.enabledTypes, type ] }
    })
  }

  async function runOnServer() {
    const keyConfig = getApiKey()!
    setGenError(null)
    try {
      await requestServerRun({ apiKey: keyConfig.key, prepId, model: keyConfig.model, tier: keyConfig.tier, target: localConfig })
      expectRun()
      await refreshProgress()
    } catch (e: unknown) {
      setGenError((e as Error).message)
    }
  }

  async function runInBrowser() {
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
        target: localConfig,
        signal: abortRef.current.signal,
        logger: consoleLogger,
        sampler: clientSampler,
        onProgress: event => {
          setProgress(event)
          // The `prep.meta` job has committed by the time questions start.
          if (event.stage === "questions" && !titleNotified) {
            titleNotified = true
            void getMyPrep(prepId).then(fresh => onTitleReady(fresh.title))
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

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${prepId}`)}`)
      return
    }
    await (executionMode === "server" ? runOnServer() : runInBrowser())
  }

  async function handleResumeInterrupted() {
    if (!getApiKey()) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${prepId}`)}`)
      return
    }
    await runOnServer()
  }

  async function handleRetryTerminal() {
    setGenError(null)
    try {
      await retryTerminalJobs(prepId)
      await refreshProgress()
    } catch (e: unknown) {
      setGenError((e as Error).message)
    }
  }

  const isRunning = genPhase === "running"
  const hasPartialRun = prepProgress !== null
  const isServerRunning = prepProgress?.runState === "running"
  const isInterrupted = prepProgress?.runState === "interrupted"

  if (hasQuestions && genPhase === "idle") return null

  const checklistRows = isRunning
    ? rowsFromProgress(progress)
    : hasPartialRun ? rowsFromSummary(prepProgress, prepTitle) : null

  return (
    <>
      {!hasQuestions && (
        <div className="flex flex-col gap-3">
          {checklistRows ? (
            <>
              <div className="flex flex-col gap-2.5">
                {checklistRows.map(row => <ChecklistRow key={row.label} row={row} />)}
              </div>
              <div className="mt-4 flex items-center gap-2.5">
                {isRunning ? (
                  <Button variant="outline" onClick={() => abortRef.current?.abort()}>Cancel</Button>
                ) : isServerRunning ? (
                  <p className="text-sm text-muted-foreground">Running on the server. You can close this tab.</p>
                ) : isInterrupted ? (
                  <>
                    <Button onClick={handleResumeInterrupted}>Resume on server</Button>
                    <p className="text-sm text-error">Interrupted. Resume to send your key again; finished steps are kept.</p>
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
              {!isRunning && !isServerRunning && !isInterrupted && <AdditionalSettings executionMode={executionMode} onExecutionModeChange={setExecutionMode} />}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Generate study questions from this material.</p>

              <div className="min-w-[280px] self-start overflow-hidden rounded-sm border border-border">
                <button
                  className="flex w-full items-center justify-between gap-3 bg-background px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setGenConfigOpen(v => !v)}
                >
                  <span className="flex-1">
                    {localConfig.questionCount} questions
                    {" · "}
                    {localConfig.enabledTypes.length === ALL_QUESTION_TYPES.length
                      ? "All types"
                      : localConfig.enabledTypes.map(t => TYPE_LABELS[t]).join(", ")}
                  </span>
                  <span className="text-xs opacity-60">{genConfigOpen ? "▲" : "▼"}</span>
                </button>

                {genConfigOpen && (
                  <div className="flex flex-col gap-3 border-t border-border bg-background p-3.5">
                    <div className="flex items-start gap-2.5">
                      <Label className="min-w-[68px] pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Questions</Label>
                      <Input
                        type="number"
                        min={5}
                        max={20}
                        value={localConfig.questionCount}
                        onChange={e => setLocalConfig(prev => ({
                          ...prev,
                          questionCount: Math.min(20, Math.max(5, Number(e.target.value) || 10)),
                        }))}
                        className="w-[68px]"
                      />
                      <span className="pt-1.5 text-xs text-muted-foreground">5–20</span>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <Label className="min-w-[68px] pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Types</Label>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {ALL_QUESTION_TYPES.map(type => {
                          const checked = localConfig.enabledTypes.includes(type)
                          const isOnly = checked && localConfig.enabledTypes.length === 1
                          return (
                            <Label key={type} className={cn("gap-1.5 text-sm font-normal", isOnly && "cursor-not-allowed opacity-50")}>
                              <Checkbox checked={checked} disabled={isOnly} onCheckedChange={() => toggleLocalType(type)} />
                              {TYPE_LABELS[type]}
                            </Label>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <AdditionalSettings executionMode={executionMode} onExecutionModeChange={setExecutionMode} />
              <Button className="self-start" onClick={handleGenerate}>Generate questions</Button>
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
