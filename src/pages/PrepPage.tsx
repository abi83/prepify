import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import type { Question, Attempt, FlashcardContent } from '../types/questions'
import type { PipelineProgressEvent } from '../types/pipeline'
import { getApiKey, estimateCost, formatCost } from '../lib/apiKey'
import { runPipeline } from '../lib/pipeline'
import { getGenerationConfig, ALL_QUESTION_TYPES, TYPE_LABELS } from '../lib/generationConfig'
import type { GenerationConfig } from '../lib/generationConfig'
import type { QuestionType } from '../types/questions'
import { getExistingRunSummary } from '../lib/pipelineStore'
import type { PartialRunSummary } from '../lib/pipelineStore'
import FlashCard from '../components/questions/FlashCard'
import AttemptFlow from '../components/attempt/AttemptFlow'
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

// ── Main component ──────────────────────────────────────────────────────────

export default function PrepPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [prep, setPrep] = useState<Prep | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
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
  const abortRef = useRef<AbortController | null>(null)
  const genStartRef = useRef(0)

  const [userId, setUserId] = useState<string | null>(null)

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
    ]).then(([{ data: prepData }, { data: qData }, { data: aData }, summary]) => {
      setPrep(prepData)
      setQuestions((qData ?? []) as Question[])
      setAttempts((aData ?? []) as Attempt[])
      setRunSummary(summary)
      setLoading(false)
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
        rawText: prep!.raw_text,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        questionCount: localConfig.questionCount,
        enabledTypes: localConfig.enabledTypes,
        signal: abortRef.current.signal,
        onProgress: (event) => {
          setPipelineProgress(event)
          if (event.stage === 'crafting') setCraftProgress({ done: event.done, total: event.total })
          if (event.stage === 'reviewing') setReviewProgress({ done: event.done, total: event.total })
        },
        onTitleReady: (title) => {
          supabase.from('preps').update({ title }).eq('id', id!)
          setPrep(p => p ? { ...p, title } : p)
          setTitleReady(true)
        },
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)

      const rows = result.questions.map(q => ({ prep_id: id!, type: q.type, content: q.content }))
      const { data: saved } = await supabase.from('questions').insert(rows).select()
      setQuestions((saved ?? []) as Question[])

      // Refresh prep to get the up-to-date tokens_used accumulated in DB
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
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/preps')}>← My Preps</button>
        <button className={styles.settingsLink} onClick={() => navigate('/settings')}>Settings</button>
      </header>

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

        <div className={styles.textCard}>
          <div className={styles.textHeader}>
            <span className={styles.textLabel}>Extracted text</span>
            <button className={styles.toggle} onClick={() => setExpanded(v => !v)}>
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className={`${styles.textBody} ${expanded ? styles.expanded : ''}`}>
            <pre className={styles.pre}>{prep.raw_text}</pre>
          </div>
        </div>

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
