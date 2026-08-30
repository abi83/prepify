'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { Prep, Question, Attempt, Asset } from '@prisma/client'
import type { VisualElement, Page } from '../types/prep'
import type { FlashcardContent } from '../types/questions'
import type { PipelineProgressEvent, Concept } from '../types/pipeline'
import { getApiKey, estimateCost, formatCost } from '../lib/apiKey'
import { runPipeline, TextTooLongError } from '../lib/pipeline'
import { BYOK_TEXT_HARD_LIMIT } from '../lib/config'
import { getGenerationConfig, ALL_QUESTION_TYPES, TYPE_LABELS } from '../lib/generationConfig'
import type { GenerationConfig } from '../lib/generationConfig'
import type { QuestionType } from '../types/questions'
import { getExistingRunSummary } from '../actions/pipeline'
import type { PartialRunSummary } from '../repositories/pipelineRepository'
import { insertQuestions } from '../actions/questions'
import { getMyPrep, deletePrep, updatePrep } from '../actions/preps'
import { generateAndSaveAssets } from '../lib/assetGeneration'
import { disciplineFromEnum, disciplineToEnum } from '../lib/disciplineMapping'
import { cn } from '@/lib/utils'
import StudyTabs from '../components/StudyTabs'
import AttemptFlow from '../components/attempt/AttemptFlow'
import ShareModal from '../components/ShareModal'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

type Tab = 'cards' | 'quiz' | 'test'
type GenPhase = 'idle' | 'running' | 'done'

// ── Pipeline checklist ──────────────────────────────────────────────────────

type RowStatus = 'pending' | 'running' | 'done'

interface ChecklistRowData {
  label: string
  status: RowStatus
  detail?: string
}

/** Derives checklist rows from live progress during generation. */
function rowsFromProgress(
  progress: PipelineProgressEvent | null,
  craft: { done: number; total: number } | null,
  review: { done: number; total: number } | null,
  titleReady: boolean,
): ChecklistRowData[] {
  const stage = progress?.stage ?? null

  const conceptsDone = stage !== null && stage !== 'concepts'
  const conceptsRunning = stage === 'concepts' || stage === null

  // Naming runs in parallel with question building (starts after concepts)
  const namingActive = conceptsDone && stage !== 'done'
  const namingDone = titleReady || stage === 'done'

  const craftingDone = stage === 'reviewing' || stage === 'done'
  const craftingRunning = stage === 'crafting' || stage === 'resuming'

  const reviewingDone = stage === 'done'
  const reviewingRunning = stage === 'reviewing'

  return [
    {
      label: 'Extract educational concepts',
      status: conceptsDone ? 'done' : conceptsRunning ? 'running' : 'pending',
    },
    {
      label: 'Name the prep',
      status: namingDone ? 'done' : namingActive ? 'running' : 'pending',
    },
    {
      label: 'Craft questions',
      status: craftingDone ? 'done' : craftingRunning ? 'running' : 'pending',
      detail: craft ? `${craft.done}/${craft.total}` : undefined,
    },
    {
      label: 'Validate questions',
      status: reviewingDone ? 'done' : reviewingRunning ? 'running' : 'pending',
      detail: review ? `${review.done}/${review.total}` : undefined,
    },
  ]
}


const DEFAULT_TITLE_RE = /^Prep #\d+$/

/** Derives checklist rows from stored DB state (idle / resume prompt). */
function rowsFromSummary(s: PartialRunSummary, prepTitle: string): ChecklistRowData[] {
  const total = s.totalTasks || 10
  const n = s.completedSlots
  const titled = !DEFAULT_TITLE_RE.test(prepTitle)
  return [
    {
      label: 'Extract educational concepts',
      status: s.hasConcepts ? 'done' : 'pending',
    },
    {
      label: 'Name the prep',
      status: titled ? 'done' : 'pending',
    },
    {
      label: 'Craft questions',
      status: n > 0 ? 'done' : 'pending',
      detail: s.totalTasks > 0 ? `${n}/${total}` : undefined,
    },
    {
      label: 'Validate questions',
      status: n > 0 ? 'done' : 'pending',
      detail: s.totalTasks > 0 ? `${n}/${total}` : undefined,
    },
  ]
}

function ChecklistRow({ row }: { row: ChecklistRowData }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center text-sm font-bold',
          row.status === 'done' ? 'text-primary' : row.status === 'running' ? 'text-muted-foreground' : 'text-border',
        )}
      >
        {row.status === 'done' ? '✓' : row.status === 'running' ? (
          <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
        ) : '○'}
      </span>
      <span className={cn('leading-snug', row.status === 'pending' && 'text-muted-foreground')}>
        {row.label}
        {row.detail && (
          <span className="text-sm text-muted-foreground"> ({row.detail})</span>
        )}
      </span>
    </div>
  )
}

// ── Per-page section ────────────────────────────────────────────────────────

function VisualElementItem({ el }: { el: VisualElement }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="rounded text-xs font-semibold tracking-wide text-muted-foreground uppercase bg-muted px-1.5 py-0.5">{el.type}</span>
        <span className="ml-auto text-xs text-muted-foreground">{Math.round(el.confidence * 100)}%</span>
      </div>
      <p className="mb-1.5 text-sm text-foreground">{el.description}</p>
      {el.content && <pre className="mb-1.5 rounded bg-muted p-2.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">{el.content}</pre>}
      {el.caption && <p className="mt-0.5 text-sm text-muted-foreground"><strong>Caption:</strong> {el.caption}</p>}
      {el.context && <p className="mt-0.5 text-sm text-muted-foreground"><strong>Context:</strong> {el.context}</p>}
    </div>
  )
}

function PageSection({ page }: { page: Page }) {
  const [open, setOpen] = useState(false)
  const hasVisuals = page.visual_elements.length > 0
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Page {page.page}</span>
        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setOpen(v => !v)}>
          {open ? 'Collapse' : 'Expand'}
        </Button>
      </div>
      {open && (
        <>
          <div className="max-h-[2000px] overflow-hidden transition-[max-height]">
            <pre className="p-5 font-body text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">{page.text}</pre>
          </div>
          {hasVisuals && (
            <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
              {page.visual_elements.map((el, i) => (
                <VisualElementItem key={i} el={el} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  prep: Prep | null
  questions?: Question[]
  attempts?: Attempt[]
  assets?: Asset[]
  runSummary?: PartialRunSummary | null
  concepts?: Concept[]
}

export default function PrepPage({ prep, questions, attempts, assets, runSummary, concepts }: Props) {
  const router = useRouter()

  if (!prep) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5">
        <p>Prep not found.</p>
        <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => router.push('/preps')}>← Back to My Preps</Button>
      </div>
    )
  }

  return (
    <PrepPageInner
      prep={prep}
      questions={questions ?? []}
      attempts={attempts ?? []}
      assets={assets ?? []}
      runSummary={runSummary ?? null}
      concepts={concepts ?? []}
    />
  )
}

interface InnerProps {
  prep: Prep
  questions: Question[]
  attempts: Attempt[]
  assets: Asset[]
  runSummary: PartialRunSummary | null
  concepts: Concept[]
}

function PrepPageInner({
  prep: initialPrep,
  questions: initialQuestions,
  attempts: initialAttempts,
  assets: initialAssets,
  runSummary: initialRunSummary,
  concepts: initialConcepts,
}: InnerProps) {
  const router = useRouter()
  const id = initialPrep.id

  const [prep, setPrep] = useState<Prep>(initialPrep)
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [attempts, setAttempts] = useState<Attempt[]>(initialAttempts)
  const [assets, setAssets] = useState<Asset[]>(initialAssets)
  const [tab, setTab] = useState<Tab>('cards')
  const [activeAttempt, setActiveAttempt] = useState<Tab | null>(null)

  useEffect(() => setPrep(initialPrep), [initialPrep])
  useEffect(() => setQuestions(initialQuestions), [initialQuestions])
  useEffect(() => setAttempts(initialAttempts), [initialAttempts])
  useEffect(() => setAssets(initialAssets), [initialAssets])

  const [genPhase, setGenPhase] = useState<GenPhase>('idle')
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgressEvent | null>(null)
  const [craftProgress, setCraftProgress] = useState<{ done: number; total: number } | null>(null)
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null)
  const [titleReady, setTitleReady] = useState(false)
  const [runSummary, setRunSummary] = useState<PartialRunSummary | null>(initialRunSummary)
  const [localConfig, setLocalConfig] = useState<GenerationConfig>(() => getGenerationConfig())
  const [genConfigOpen, setGenConfigOpen] = useState(false)
  const [genMs, setGenMs] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
  const [textTooLong, setTextTooLong] = useState<{ length: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const genStartRef = useRef(0)

  const { data: session } = useSession()
  const userId = session?.user.id ?? null
  const [concepts] = useState<Concept[]>(initialConcepts)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function refreshRunSummary() {
    const s = await getExistingRunSummary(id)
    setRunSummary(s)
  }

  function toggleLocalType(type: QuestionType) {
    setLocalConfig(prev => {
      const already = prev.enabledTypes.includes(type)
      if (already && prev.enabledTypes.length === 1) return prev
      return {
        ...prev,
        enabledTypes: already
          ? prev.enabledTypes.filter(t => t !== type)
          : [...prev.enabledTypes, type],
      }
    })
  }

  async function runGeneration(pages: Page[]) {
    const keyConfig = getApiKey()!

    setGenError(null)
    setPipelineProgress(null)
    setCraftProgress(null)
    setReviewProgress(null)
    setTitleReady(false)
    abortRef.current = new AbortController()
    genStartRef.current = performance.now()
    setGenPhase('running')

    try {
      const result = await runPipeline({
        prepId: id,
        pages,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        language: prep.language ?? 'en',
        questionCount: localConfig.questionCount,
        enabledTypes: localConfig.enabledTypes,
        signal: abortRef.current.signal,
        onProgress: (event) => {
          setPipelineProgress(event)
          if (event.stage === 'crafting') setCraftProgress({ done: event.done, total: event.total })
          if (event.stage === 'reviewing') setReviewProgress({ done: event.done, total: event.total })
        },
        onTitleReady: (title) => {
          void updatePrep(id, { title })
          setPrep(p => ({ ...p, title }))
          setTitleReady(true)
        },
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)

      const savedQuestions = await insertQuestions(
        id,
        result.questions.map(q => ({ type: q.type, content: q.content })),
      )
      setQuestions(savedQuestions)

      // Generate visual assets for questions that requested one (non-blocking — failures are soft)
      if (savedQuestions.length > 0) {
        void generateAndSaveAssets(savedQuestions, id, keyConfig.key, keyConfig.model, abortRef.current?.signal)
      }

      // Refresh prep to get the up-to-date tokens_used accumulated in DB
      const freshPrep = await getMyPrep(id)
      setPrep(freshPrep)

      setGenMs(elapsed)
      setTotalTokens(result.totalTokens)
      setGenPhase('done')
      await refreshRunSummary()
      router.refresh()
    } catch (e: unknown) {
      if (e instanceof TextTooLongError) {
        setTextTooLong({ length: e.length })
        setGenPhase('idle')
        return
      }
      if ((e as Error).name !== 'AbortError') setGenError((e as Error).message)
      setGenPhase('idle')
      await refreshRunSummary()
    }
  }

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) {
      router.push(`/settings?returnTo=${encodeURIComponent(`/preps/${id}`)}`)
      return
    }
    await runGeneration((prep.pages as unknown as Page[]) ?? [])
  }

  async function handleConfirmTruncate() {
    setTextTooLong(null)

    // Truncate by keeping pages until we hit the char limit
    let charCount = 0
    const pages = (prep.pages as unknown as Page[]) ?? []
    const truncatedPages = pages.filter(p => {
      if (charCount >= BYOK_TEXT_HARD_LIMIT) return false
      charCount += p.text.length
      return true
    })

    await runGeneration(truncatedPages)
  }

  async function handleDelete() {
    setDeleting(true)
    await deletePrep(id)
    router.push('/preps')
  }

  function handleExitAttempt() {
    setActiveAttempt(null)
    router.refresh()
  }

  const pages = (prep.pages as unknown as Page[]) ?? []
  const hasQuestions = questions.length > 0
  const flashcards = questions.filter(q => q.type === 'flashcard').map(q => q.content as unknown as FlashcardContent)
  const studyQuestions = questions.filter(q => q.type !== 'flashcard')

  const isRunning = genPhase === 'running'
  const hasPartialRun = runSummary !== null

  if (activeAttempt && (activeAttempt === 'quiz' || activeAttempt === 'test') && userId) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={handleExitAttempt}>← Back to Prep</Button>
        </header>
        <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
          <AttemptFlow
            questions={studyQuestions}
            assets={assets}
            mode={activeAttempt}
            prepId={prep.id}
            userId={userId}
            onExit={handleExitAttempt}
          />
        </main>
      </div>
    )
  }

  // Checklist rows for the current state
  const checklistRows = isRunning
    ? rowsFromProgress(pipelineProgress, craftProgress, reviewProgress, titleReady)
    : hasPartialRun
    ? rowsFromSummary(runSummary, prep.title)
    : null

  return (
    <div className="flex min-h-screen flex-col">
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete prep?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{prep.title}</strong> and all its questions, attempts, and pipeline data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => router.push('/preps')}>← My Preps</Button>
        <div className="flex items-center gap-4">
          {prep.userId === userId && hasQuestions && (
            <Button size="sm" onClick={() => setShowShareModal(true)}>
              {prep.visibility === 'private' ? 'Share' : 'Shared'}
            </Button>
          )}
          {prep.userId === userId && (
            <Button variant="link" className="h-auto p-0 text-sm text-error" onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
          )}
          <Button variant="link" className="h-auto p-0 text-sm text-muted-foreground" onClick={() => router.push('/settings')}>Settings</Button>
        </div>
      </header>

      {showShareModal && prep.userId === userId && (
        <ShareModal
          prepId={prep.id}
          concepts={concepts}
          apiKey={getApiKey()?.key ?? ''}
          model={getApiKey()?.model ?? 'gpt-5-nano'}
          initialVisibility={prep.visibility}
          initialGrade={prep.grade}
          initialDiscipline={disciplineFromEnum(prep.discipline)}
          onSave={(visibility, grade, discipline) => {
            setPrep(p => ({ ...p, visibility, grade, discipline: disciplineToEnum(discipline) }))
            router.refresh()
          }}
          onClose={() => setShowShareModal(false)}
        />
      )}

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{prep.title}</h1>
          <span className="text-sm text-muted-foreground">{formatDate(prep.createdAt)}</span>
          {prep.tokensUsed > 0 && (
            <span className="text-xs text-muted-foreground">
              {prep.tokensUsed.toLocaleString()} tokens
              {getApiKey() && (
                <> · ~{formatCost(estimateCost(prep.tokensUsed * 0.8, prep.tokensUsed * 0.2, getApiKey()!.model))}</>
              )}
            </span>
          )}
        </div>

        {pages.map(page => (
          <PageSection key={page.page} page={page} />
        ))}

        {/* ── Generation area ── */}
        {!hasQuestions && (
          <div className="flex flex-col gap-3">
            {checklistRows ? (
              <>
                <div className="flex flex-col gap-2.5">
                  {checklistRows.map(row => <ChecklistRow key={row.label} row={row} />)}
                </div>
                <div className="mt-4 flex items-center gap-2.5">
                  {isRunning ? (
                    <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                      Cancel
                    </Button>
                  ) : (
                    <Button onClick={handleGenerate}>
                      {hasPartialRun && runSummary.completedSlots > 0 ? 'Resume generation' : 'Start generation'}
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
                      {' · '}
                      {localConfig.enabledTypes.length === ALL_QUESTION_TYPES.length
                        ? 'All types'
                        : localConfig.enabledTypes.map(t => TYPE_LABELS[t]).join(', ')}
                    </span>
                    <span className="text-xs opacity-60">{genConfigOpen ? '▲' : '▼'}</span>
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
                              <Label
                                key={type}
                                className={cn('gap-1.5 text-sm font-normal', isOnly && 'cursor-not-allowed opacity-50')}
                              >
                                <Checkbox
                                  checked={checked}
                                  disabled={isOnly}
                                  onCheckedChange={() => toggleLocalType(type)}
                                />
                                {TYPE_LABELS[type]}
                              </Label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Button className="self-start" onClick={handleGenerate}>
                  Generate questions
                </Button>
              </>
            )}
          </div>
        )}

        {genError && (
          <div className="flex items-center gap-3 rounded-sm border border-error bg-error/10 px-4 py-3 text-sm text-error">
            <strong>Error:</strong> {genError}
            <Button variant="link" className="ml-auto h-auto p-0 text-xs text-error underline" onClick={() => { setGenError(null); setGenPhase('idle') }}>
              Retry
            </Button>
          </div>
        )}

        {(genPhase === 'done' || hasQuestions) && totalTokens > 0 && (
          <div className="text-xs text-muted-foreground">
            Generated in {(genMs / 1000).toFixed(1)}s · {totalTokens.toLocaleString()} tokens
          </div>
        )}

        {hasQuestions && (
          <>
            <StudyTabs
              tab={tab}
              onTabChange={setTab}
              flashcards={flashcards}
              studyQuestions={studyQuestions}
              onStartAttempt={mode => setActiveAttempt(mode)}
            />

            {attempts.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">Attempt history</h3>
                <div className="flex flex-col gap-1.5">
                  {attempts.map(a => (
                    <div key={a.id} className="flex items-center gap-3 rounded-sm border border-border bg-background px-4 py-3 text-sm">
                      <span className="min-w-[40px] font-semibold capitalize">{a.mode}</span>
                      <span className="font-semibold text-primary">
                        {a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)
                      </span>
                      <span className="ml-auto text-muted-foreground">{formatDate(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
