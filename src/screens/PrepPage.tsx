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
import FlashCard from '../components/questions/FlashCard'
import AttemptFlow from '../components/attempt/AttemptFlow'
import ShareModal from '../components/ShareModal'
import styles from './PrepPage.module.css'

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
    <div className={styles.checklistRow}>
      <span
        className={`${styles.checklistIcon} ${
          row.status === 'done' ? styles.iconDone :
          row.status === 'running' ? styles.iconRunning :
          styles.iconPending
        }`}
      >
        {row.status === 'done' ? '✓' : row.status === 'running' ? <span className={styles.dotPulse} /> : '○'}
      </span>
      <span className={`${styles.checklistLabel} ${row.status === 'pending' ? styles.labelMuted : ''}`}>
        {row.label}
        {row.detail && (
          <span className={styles.checklistDetail}> ({row.detail})</span>
        )}
      </span>
    </div>
  )
}

// ── Per-page section ────────────────────────────────────────────────────────

function VisualElementItem({ el }: { el: VisualElement }) {
  return (
    <div className={styles.visualElementItem}>
      <div className={styles.visualElementHeader}>
        <span className={styles.visualElementType}>{el.type}</span>
        <span className={styles.visualElementConfidence}>{Math.round(el.confidence * 100)}%</span>
      </div>
      <p className={styles.visualElementDescription}>{el.description}</p>
      {el.content && <pre className={styles.visualElementContent}>{el.content}</pre>}
      {el.caption && <p className={styles.visualElementMeta}><strong>Caption:</strong> {el.caption}</p>}
      {el.context && <p className={styles.visualElementMeta}><strong>Context:</strong> {el.context}</p>}
    </div>
  )
}

function PageSection({ page }: { page: Page }) {
  const [open, setOpen] = useState(false)
  const hasVisuals = page.visual_elements.length > 0
  return (
    <div className={styles.textCard}>
      <div className={styles.textHeader}>
        <span className={styles.textLabel}>Page {page.page}</span>
        <button className={styles.toggle} onClick={() => setOpen(v => !v)}>
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {open && (
        <>
          <div className={`${styles.textBody} ${styles.expanded}`}>
            <pre className={styles.pre}>{page.text}</pre>
          </div>
          {hasVisuals && (
            <div className={styles.visualElementsList}>
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
      <div className={styles.center}>
        <p>Prep not found.</p>
        <button className={styles.back} onClick={() => router.push('/preps')}>← Back to My Preps</button>
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
      <div className={styles.root}>
        <header className={styles.header}>
          <button className={styles.back} onClick={handleExitAttempt}>← Back to Prep</button>
        </header>
        <main className={styles.main}>
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
    <div className={styles.root}>
      {showDeleteConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <h2 className={styles.modalTitle}>Delete prep?</h2>
            <p className={styles.modalBody}>
              This will permanently delete <strong>{prep.title}</strong> and all its questions, attempts, and pipeline data.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button className={styles.modalDelete} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {textTooLong && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <h2 className={styles.modalTitle}>Text too long</h2>
            <p className={styles.modalBody}>
              Your text is <strong>{textTooLong.length.toLocaleString()}</strong> characters.
              Only pages up to <strong>{BYOK_TEXT_HARD_LIMIT.toLocaleString()}</strong> characters will be processed —
              later pages will be ignored.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancel} onClick={() => setTextTooLong(null)}>Cancel</button>
              <button className={styles.modalConfirm} onClick={handleConfirmTruncate}>Continue anyway</button>
            </div>
          </div>
        </div>
      )}

      <header className={styles.header}>
        <button className={styles.back} onClick={() => router.push('/preps')}>← My Preps</button>
        <div className={styles.headerRight}>
          {prep.userId === userId && hasQuestions && (
            <button className={styles.shareBtn} onClick={() => setShowShareModal(true)}>
              {prep.visibility === 'private' ? 'Share' : 'Shared'}
            </button>
          )}
          {prep.userId === userId && (
            <button className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>Delete</button>
          )}
          <button className={styles.settingsLink} onClick={() => router.push('/settings')}>Settings</button>
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

      <main className={styles.main}>
        <div className={styles.meta}>
          <h1 className={styles.title}>{prep.title}</h1>
          <span className={styles.date}>{formatDate(prep.createdAt)}</span>
          {prep.tokensUsed > 0 && (
            <span className={styles.tokensBadge}>
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
          <div className={styles.generateArea}>
            {checklistRows ? (
              <>
                <div className={styles.checklist}>
                  {checklistRows.map(row => <ChecklistRow key={row.label} row={row} />)}
                </div>
                <div className={styles.checklistActions}>
                  {isRunning ? (
                    <button className={styles.cancelGenBtn} onClick={() => abortRef.current?.abort()}>
                      Cancel
                    </button>
                  ) : (
                    <button className={styles.generateBtn} onClick={handleGenerate}>
                      {hasPartialRun && runSummary.completedSlots > 0 ? 'Resume generation' : 'Start generation'}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className={styles.generateHint}>Generate study questions from this material.</p>

                <div className={styles.genConfigPanel}>
                  <button
                    className={styles.genConfigToggle}
                    onClick={() => setGenConfigOpen(v => !v)}
                  >
                    <span className={styles.genConfigSummary}>
                      {localConfig.questionCount} questions
                      {' · '}
                      {localConfig.enabledTypes.length === ALL_QUESTION_TYPES.length
                        ? 'All types'
                        : localConfig.enabledTypes.map(t => TYPE_LABELS[t]).join(', ')}
                    </span>
                    <span className={styles.genConfigCaret}>{genConfigOpen ? '▲' : '▼'}</span>
                  </button>

                  {genConfigOpen && (
                    <div className={styles.genConfigBody}>
                      <div className={styles.genConfigRow}>
                        <label className={styles.genConfigLabel}>Questions</label>
                        <input
                          type="number"
                          className={styles.genConfigNumber}
                          min={5}
                          max={20}
                          value={localConfig.questionCount}
                          onChange={e => setLocalConfig(prev => ({
                            ...prev,
                            questionCount: Math.min(20, Math.max(5, Number(e.target.value) || 10)),
                          }))}
                        />
                        <span className={styles.genConfigRange}>5–20</span>
                      </div>

                      <div className={styles.genConfigRow}>
                        <label className={styles.genConfigLabel}>Types</label>
                        <div className={styles.genTypeToggles}>
                          {ALL_QUESTION_TYPES.map(type => {
                            const checked = localConfig.enabledTypes.includes(type)
                            const isOnly = checked && localConfig.enabledTypes.length === 1
                            return (
                              <label
                                key={type}
                                className={`${styles.genTypeToggle} ${isOnly ? styles.genTypeToggleOnly : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={isOnly}
                                  onChange={() => toggleLocalType(type)}
                                />
                                {TYPE_LABELS[type]}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button className={styles.generateBtn} onClick={handleGenerate}>
                  Generate questions
                </button>
              </>
            )}
          </div>
        )}

        {genError && (
          <div className={styles.genError}>
            <strong>Error:</strong> {genError}
            <button className={styles.retryBtn} onClick={() => { setGenError(null); setGenPhase('idle') }}>
              Retry
            </button>
          </div>
        )}

        {(genPhase === 'done' || hasQuestions) && totalTokens > 0 && (
          <div className={styles.statLine}>
            Generated in {(genMs / 1000).toFixed(1)}s · {totalTokens.toLocaleString()} tokens
          </div>
        )}

        {hasQuestions && (
          <>
            <div className={styles.tabs}>
              {(['cards', 'quiz', 'test'] as Tab[]).map(t => (
                <button
                  key={t}
                  className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            <div className={styles.tabContent}>
              {tab === 'cards' && (
                flashcards.length > 0
                  ? <FlashCard cards={flashcards} />
                  : <p className={styles.empty}>No flashcards in this set.</p>
              )}

              {tab === 'quiz' && (
                <div className={styles.modeCard}>
                  <p className={styles.modeDesc}>Answer questions one at a time — get instant feedback after each.</p>
                  <button
                    className={styles.startBtn}
                    onClick={() => setActiveAttempt('quiz')}
                    disabled={studyQuestions.length === 0}
                  >
                    Start Quiz ({studyQuestions.length} questions)
                  </button>
                </div>
              )}

              {tab === 'test' && (
                <div className={styles.modeCard}>
                  <p className={styles.modeDesc}>Answer all questions without hints — results revealed at the end.</p>
                  <button
                    className={styles.startBtn}
                    onClick={() => setActiveAttempt('test')}
                    disabled={studyQuestions.length === 0}
                  >
                    Start Test ({studyQuestions.length} questions)
                  </button>
                </div>
              )}
            </div>

            {attempts.length > 0 && (
              <div className={styles.history}>
                <h3 className={styles.historyTitle}>Attempt history</h3>
                <div className={styles.historyList}>
                  {attempts.map(a => (
                    <div key={a.id} className={styles.historyItem}>
                      <span className={styles.historyMode}>{a.mode}</span>
                      <span className={styles.historyScore}>
                        {a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)
                      </span>
                      <span className={styles.historyDate}>{formatDate(a.createdAt)}</span>
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
