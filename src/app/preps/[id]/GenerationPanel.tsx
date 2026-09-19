"use client"

import type { Prep, Question } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useState, useRef } from "react"

import { getExistingRunSummary } from "@/actions/pipeline"
import { getMyPrep, updatePrep } from "@/actions/preps"
import { insertQuestions } from "@/actions/questions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getApiKey } from "@/lib/apiKey"
import { generateAndSaveAssets } from "@/lib/assetGeneration"
import { BYOK_TEXT_HARD_LIMIT } from "@/lib/config"
import type { GenerationConfig } from "@/lib/generationConfig"
import { getGenerationConfig, ALL_QUESTION_TYPES, TYPE_LABELS } from "@/lib/generationConfig"
import { runPipeline, TextTooLongError } from "@/lib/pipeline"
import { cn } from "@/lib/utils"
import type { PartialRunSummary } from "@/repositories/pipelineRepository"
import type { PipelineProgressEvent } from "@/types/pipeline"
import type { Page } from "@/types/prep"
import type { QuestionType } from "@/types/questions"

import { type GenPhase, rowsFromProgress, rowsFromSummary, ChecklistRow } from "./GenerationChecklist"

interface Props {
  prepId: string
  pages: Page[]
  language: string
  prepTitle: string
  initialRunSummary: PartialRunSummary | null
  hasQuestions: boolean
  onTitleReady: (title: string) => void
  onComplete: (questions: Question[], freshPrep: Prep) => void
}

export default function GenerationPanel({
  prepId,
  pages,
  language,
  prepTitle,
  initialRunSummary,
  hasQuestions,
  onTitleReady,
  onComplete,
}: Props) {
  const router = useRouter()
  const [ genPhase, setGenPhase ] = useState<GenPhase>("idle")
  const [ pipelineProgress, setPipelineProgress ] = useState<PipelineProgressEvent | null>(null)
  const [ craftProgress, setCraftProgress ] = useState<{ done: number; total: number } | null>(null)
  const [ reviewProgress, setReviewProgress ] = useState<{ done: number; total: number } | null>(null)
  const [ titleReady, setTitleReady ] = useState(false)
  const [ runSummary, setRunSummary ] = useState<PartialRunSummary | null>(initialRunSummary)
  const [ localConfig, setLocalConfig ] = useState<GenerationConfig>(() => getGenerationConfig())
  const [ genConfigOpen, setGenConfigOpen ] = useState(false)
  const [ genMs, setGenMs ] = useState(0)
  const [ totalTokens, setTotalTokens ] = useState(0)
  const [ genError, setGenError ] = useState<string | null>(null)
  const [ textTooLong, setTextTooLong ] = useState<{ length: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const genStartRef = useRef(0)

  async function refreshRunSummary() {
    const s = await getExistingRunSummary(prepId)
    setRunSummary(s)
  }

  function toggleLocalType(type: QuestionType) {
    setLocalConfig(prev => {
      const already = prev.enabledTypes.includes(type)
      if (already && prev.enabledTypes.length === 1) return prev
      return { ...prev, enabledTypes: already ? prev.enabledTypes.filter(t => t !== type) : [ ...prev.enabledTypes, type ] }
    })
  }

  async function runGeneration(pagesToProcess: Page[]) {
    const keyConfig = getApiKey()!
    setGenError(null)
    setPipelineProgress(null)
    setCraftProgress(null)
    setReviewProgress(null)
    setTitleReady(false)
    abortRef.current = new AbortController()
    genStartRef.current = performance.now()
    setGenPhase("running")

    try {
      const result = await runPipeline({
        prepId,
        pages: pagesToProcess,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        language,
        questionCount: localConfig.questionCount,
        enabledTypes: localConfig.enabledTypes,
        signal: abortRef.current.signal,
        onProgress: (event) => {
          setPipelineProgress(event)
          if (event.stage === "crafting") setCraftProgress({ done: event.done, total: event.total })
          if (event.stage === "reviewing") setReviewProgress({ done: event.done, total: event.total })
        },
        onMetaReady: (title, description) => {
          void updatePrep(prepId, { title, description })
          onTitleReady(title)
          setTitleReady(true)
        },
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)
      const savedQuestions = await insertQuestions(prepId, result.questions.map(q => ({ type: q.type, content: q.content })))

      if (savedQuestions.length > 0) {
        void generateAndSaveAssets(savedQuestions, prepId, keyConfig.key, keyConfig.model, abortRef.current?.signal)
      }

      const freshPrep = await getMyPrep(prepId)
      onComplete(savedQuestions, freshPrep)

      setGenMs(elapsed)
      setTotalTokens(result.totalTokens)
      setGenPhase("done")
      await refreshRunSummary()
      router.refresh()
    } catch (e: unknown) {
      if (e instanceof TextTooLongError) {
        setTextTooLong({ length: e.length })
        setGenPhase("idle")
        return
      }
      if ((e as Error).name !== "AbortError") setGenError((e as Error).message)
      setGenPhase("idle")
      await refreshRunSummary()
    }
  }

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${prepId}`)}`)
      return
    }
    await runGeneration(pages)
  }

  async function handleConfirmTruncate() {
    setTextTooLong(null)
    let charCount = 0
    const truncated = pages.filter(p => {
      if (charCount >= BYOK_TEXT_HARD_LIMIT) return false
      charCount += p.text.length
      return true
    })
    await runGeneration(truncated)
  }

  const isRunning = genPhase === "running"
  const hasPartialRun = runSummary !== null

  if (hasQuestions && genPhase === "idle") return null

  const checklistRows = isRunning
    ? rowsFromProgress(pipelineProgress, craftProgress, reviewProgress, titleReady)
    : hasPartialRun ? rowsFromSummary(runSummary, prepTitle) : null

  return (
    <>
      <Dialog open={!!textTooLong} onOpenChange={open => !open && setTextTooLong(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Text too long</DialogTitle>
            <DialogDescription>
              Your text is <strong>{textTooLong?.length.toLocaleString()}</strong> characters.
              Only pages up to <strong>{BYOK_TEXT_HARD_LIMIT.toLocaleString()}</strong> characters will be processed —
              later pages will be ignored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTextTooLong(null)}>Cancel</Button>
            <Button onClick={handleConfirmTruncate}>Continue anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                ) : (
                  <Button onClick={handleGenerate}>
                    {hasPartialRun && runSummary.completedSlots > 0 ? "Resume generation" : "Start generation"}
                  </Button>
                )}
              </div>
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
    </>
  )
}
