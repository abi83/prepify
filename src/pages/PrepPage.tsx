import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep, PrepVisibility, VisualElement, Page } from '../lib/supabase'
import type { Question, Attempt, FlashcardContent, Asset } from '../types/questions'
import type { PipelineProgressEvent, Concept } from '../types/pipeline'
import { getApiKey, estimateCost, formatCost } from '../lib/apiKey'
import { runPipeline, TextTooLongError } from '../lib/pipeline'
import { BYOK_TEXT_HARD_LIMIT } from '../lib/config'
import { getGenerationConfig, ALL_QUESTION_TYPES, TYPE_LABELS } from '../lib/generationConfig'
import type { GenerationConfig } from '../lib/generationConfig'
import type { QuestionType } from '../types/questions'
import { getExistingRunSummary } from '../lib/pipelineStore'
import type { PartialRunSummary } from '../lib/pipelineStore'
import { generateAndSaveAssets } from '../lib/assetGeneration'
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

export default function PrepPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [prep, setPrep] = useState<Prep | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('cards')
  const [activeAttempt, setActiveAttempt] = useState<Tab | null>(null)

  const [genPhase, setGenPhase] = useState<GenPhase>('idle')
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgressEvent | null>(null)
  const [craftProgress, setCraftProgress] = useState<{ done: number; total: number } | null>(null)
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(null)
  const [titleReady, setTitleReady] = useState(false)
  const [runSummary, setRunSummary] = useState<PartialRunSummary | null>(null)
  const [localConfig, setLocalConfig] = useState<GenerationConfig>(() => getGenerationConfig())
  const [genConfigOpen, setGenConfigOpen] = useState(false)
  const [genMs, setGenMs] = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const [genError, setGenError] = useState<string | null>(null)
  const [textTooLong, setTextTooLong] = useState<{ length: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const genStartRef = useRef(0)

  const [userId, setUserId] = useState<string | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [showShareModal, setShowShareModal] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('preps').select('*').eq('id', id).single(),
      supabase.from('questions').select('*').eq('prep_id', id).order('created_at'),
      supabase.from('attempts').select('*').eq('prep_id', id).order('created_at', { ascending: false }),
      getExistingRunSummary(id),
      supabase.from('pipeline_runs').select('concepts').eq('prep_id', id).maybeSingle(),
    ]).then(async ([{ data: prepData }, { data: qData }, { data: aData }, summary, { data: runData }]) => {
      const qs = (qData ?? []) as Question[]
      setPrep(prepData)
      setQuestions(qs)
      setAttempts((aData ?? []) as Attempt[])
      setRunSummary(summary)
      if (runData?.concepts) setConcepts(runData.concepts as Concept[])
      setLoading(false)

      if (qs.length > 0) {
        const { data: assetData } = await supabase.from('assets').select('*').in('question_id', qs.map(q => q.id))
        setAssets((assetData ?? []) as Asset[])
      }
    })
  }, [id])

  async function refreshRunSummary() {
    if (!id) return
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

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) {
      navigate('/settings', { state: { returnTo: `/preps/${id}` } })
      return
    }

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
        prepId: id!,
        pages: prep!.pages,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        language: prep!.language ?? 'en',
        questionCount: localConfig.questionCount,
        enabledTypes: localConfig.enabledTypes,
        signal: abortRef.current.signal,
        onProgress: (event) => {
          setPipelineProgress(event)
          if (event.stage === 'crafting') setCraftProgress({ done: event.done, total: event.total })
          if (event.stage === 'reviewing') setReviewProgress({ done: event.done, total: event.total })
        },
        onTitleReady: (title) => {
          void supabase.from('preps').update({ title }).eq('id', id!).then()
          setPrep(p => p ? { ...p, title } : p)
          setTitleReady(true)
        },
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)

      const rows = result.questions.map(q => ({ prep_id: id!, type: q.type, content: q.content }))
      const { data: saved } = await supabase.from('questions').insert(rows).select()
      const savedQuestions = (saved ?? []) as Question[]
      setQuestions(savedQuestions)

      // Generate visual assets for questions that requested one (non-blocking — failures are soft)
      if (savedQuestions.length > 0) {
        void generateAndSaveAssets(savedQuestions, id!, keyConfig.key, keyConfig.model, abortRef.current?.signal)
      }

      // Refresh prep to get the up-to-date tokens_used accumulated in DB
      const { data: freshPrep } = await supabase.from('preps').select('*').eq('id', id!).single()
      if (freshPrep) setPrep(freshPrep as Prep)

      setGenMs(elapsed)
      setTotalTokens(result.totalTokens)
      setGenPhase('done')
      await refreshRunSummary()
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

  async function handleConfirmTruncate() {
    setTextTooLong(null)
    const keyConfig = getApiKey()!

    // Truncate by keeping pages until we hit the char limit
    let charCount = 0
    const truncatedPages = prep!.pages.filter(p => {
      if (charCount >= BYOK_TEXT_HARD_LIMIT) return false
      charCount += p.text.length
      return true
    })

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
        prepId: id!,
        pages: truncatedPages,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        language: prep!.language ?? 'en',
        questionCount: localConfig.questionCount,
        enabledTypes: localConfig.enabledTypes,
        signal: abortRef.current.signal,
        onProgress: (event) => {
          setPipelineProgress(event)
          if (event.stage === 'crafting') setCraftProgress({ done: event.done, total: event.total })
          if (event.stage === 'reviewing') setReviewProgress({ done: event.done, total: event.total })
        },
        onTitleReady: (title) => {
          void supabase.from('preps').update({ title }).eq('id', id!).then()
          setPrep(p => p ? { ...p, title } : p)
          setTitleReady(true)
        },
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)
      const rows = result.questions.map(q => ({ prep_id: id!, type: q.type, content: q.content }))
      const { data: saved } = await supabase.from('questions').insert(rows).select()
      const savedQuestions = (saved ?? []) as Question[]
      setQuestions(savedQuestions)
      if (savedQuestions.length > 0) {
        void generateAndSaveAssets(savedQuestions, id!, keyConfig.key, keyConfig.model, abortRef.current?.signal)
      }
      const { data: freshPrep } = await supabase.from('preps').select('*').eq('id', id!).single()
      if (freshPrep) setPrep(freshPrep as Prep)
      setGenMs(elapsed)
      setTotalTokens(result.totalTokens)
      setGenPhase('done')
      await refreshRunSummary()
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setGenError((e as Error).message)
      setGenPhase('idle')
      await refreshRunSummary()
    }
  }

  function handleExitAttempt() {
    setActiveAttempt(null)
    supabase.from('attempts').select('*').eq('prep_id', id!).order('created_at', { ascending: false })
      .then(({ data }) => setAttempts((data ?? []) as Attempt[]))
  }

  if (loading) return <div className={styles.center}><div className={styles.spinner} /></div>
  if (!prep) return (
    <div className={styles.center}>
      <p>Prep not found.</p>
      <button className={styles.back} onClick={() => navigate('/preps')}>← Back to My Preps</button>
    </div>
  )

  const hasQuestions = questions.length > 0
  const flashcards = questions.filter(q => q.type === 'flashcard').map(q => q.content as FlashcardContent)
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
        <button className={styles.back} onClick={() => navigate('/preps')}>← My Preps</button>
        <div className={styles.headerRight}>
          {prep.user_id === userId && hasQuestions && (
            <button className={styles.shareBtn} onClick={() => setShowShareModal(true)}>
              {prep.visibility === 'private' ? 'Share' : 'Shared'}
            </button>
          )}
          <button className={styles.settingsLink} onClick={() => navigate('/settings')}>Settings</button>
        </div>
      </header>

      {showShareModal && prep.user_id === userId && (
        <ShareModal
          prepId={prep.id}
          concepts={concepts}
          apiKey={getApiKey()?.key ?? ''}
          model={getApiKey()?.model ?? 'gpt-5-nano'}
          initialVisibility={prep.visibility}
          initialGrade={prep.grade}
          initialDiscipline={prep.discipline}
          onSave={(visibility: PrepVisibility, grade: number | null, discipline: string | null) => {
            setPrep(p => p ? { ...p, visibility, grade, discipline } : p)
          }}
          onClose={() => setShowShareModal(false)}
        />
      )}

      <main className={styles.main}>
        <div className={styles.meta}>
          <h1 className={styles.title}>{prep.title}</h1>
          <span className={styles.date}>{formatDate(prep.created_at)}</span>
          {prep.tokens_used > 0 && (
            <span className={styles.tokensBadge}>
              {prep.tokens_used.toLocaleString()} tokens
              {getApiKey() && (
                <> · ~{formatCost(estimateCost(prep.tokens_used * 0.8, prep.tokens_used * 0.2, getApiKey()!.model))}</>
              )}
            </span>
          )}
          {prep.study_description && (
            <p className={styles.description}>{prep.study_description}</p>
          )}
        </div>

        {prep.pages.map(page => (
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
                      <span className={styles.historyDate}>{formatDate(a.created_at)}</span>
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
