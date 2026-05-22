import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import type { Question, Attempt, FlashcardContent } from '../types/questions'
import { getApiKey } from '../lib/apiKey'
import { runPrepContextAgent } from '../lib/agents/PrepContextAgent'
import { runQuestionsAgent } from '../lib/agents/QuestionsAgent'
import type { AgentMetrics } from '../lib/agent'
import FlashCard from '../components/questions/FlashCard'
import AttemptFlow from '../components/attempt/AttemptFlow'
import SettingsModal from '../components/SettingsModal'
import styles from './PrepPage.module.css'

type Tab = 'cards' | 'quiz' | 'test'
type GenPhase = 'idle' | 'context' | 'approving' | 'generating' | 'done'

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

  // Generation state
  const [genPhase, setGenPhase] = useState<GenPhase>('idle')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [metrics, setMetrics] = useState<{ context: AgentMetrics | null; questions: AgentMetrics | null }>({ context: null, questions: null })
  const [genError, setGenError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Current user id
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
    ]).then(([{ data: prepData }, { data: qData }, { data: aData }]) => {
      setPrep(prepData)
      setQuestions((qData ?? []) as Question[])
      setAttempts((aData ?? []) as Attempt[])
      setLoading(false)
    })
  }, [id])

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) { setShowSettings(true); return }

    setGenError(null)
    abortRef.current = new AbortController()

    try {
      // Step 1: summarize
      setGenPhase('context')
      const ctxResult = await runPrepContextAgent(prep!.raw_text, keyConfig.key, abortRef.current.signal)
      setDraftTitle(ctxResult.output.title)
      setDraftDesc(ctxResult.output.description)
      setMetrics(m => ({ ...m, context: ctxResult.metrics }))
      setGenPhase('approving')
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setGenError((e as Error).message)
      setGenPhase('idle')
    }
  }

  async function handleConfirmContext() {
    const keyConfig = getApiKey()!
    setGenError(null)

    // Save study_description + title to prep
    await supabase.from('preps').update({ title: draftTitle, study_description: draftDesc }).eq('id', id!)
    setPrep(p => p ? { ...p, title: draftTitle, study_description: draftDesc } : p)

    try {
      setGenPhase('generating')
      const qResult = await runQuestionsAgent(
        { title: draftTitle, description: draftDesc, rawText: prep!.raw_text },
        keyConfig.key,
        abortRef.current?.signal
      )
      setMetrics(m => ({ ...m, questions: qResult.metrics }))

      // Save to DB
      const rows = qResult.output.map(q => ({ prep_id: id!, type: q.type, content: q.content }))
      const { data: saved } = await supabase.from('questions').insert(rows).select()
      setQuestions((saved ?? []) as Question[])
      setGenPhase('done')
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setGenError((e as Error).message)
      setGenPhase('idle')
    }
  }

  function handleExitAttempt() {
    setActiveAttempt(null)
    // Refresh attempts
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

  // If an attempt is in progress, show AttemptFlow full-screen within main
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

  const totalMs = (metrics.context?.latency_ms ?? 0) + (metrics.questions?.latency_ms ?? 0)
  const totalTokens = (metrics.context?.total_tokens ?? 0) + (metrics.questions?.total_tokens ?? 0)

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/preps')}>← My Preps</button>
      </header>

      <main className={styles.main}>
        <div className={styles.meta}>
          <h1 className={styles.title}>{prep.title}</h1>
          <span className={styles.date}>{formatDate(prep.created_at)}</span>
          {prep.study_description && (
            <p className={styles.description}>{prep.study_description}</p>
          )}
        </div>

        {/* Raw text collapsible */}
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

        {/* Generation area */}
        {!hasQuestions && genPhase === 'idle' && (
          <div className={styles.generateArea}>
            <p className={styles.generateHint}>Generate study questions from this material.</p>
            <button className={styles.generateBtn} onClick={handleGenerate}>
              Generate questions
            </button>
          </div>
        )}

        {genPhase === 'context' && (
          <div className={styles.genStatus}>
            <div className={styles.spinner} />
            <span>Summarising material…</span>
          </div>
        )}

        {genPhase === 'approving' && (
          <div className={styles.contextCard}>
            <div className={styles.contextCardHeader}>
              <span className={styles.textLabel}>Study context</span>
              <span className={styles.contextHint}>Edit if needed, then confirm</span>
            </div>
            <div className={styles.contextFields}>
              <input
                className={styles.contextInput}
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                placeholder="Title"
              />
              <textarea
                className={styles.contextTextarea}
                value={draftDesc}
                onChange={e => setDraftDesc(e.target.value)}
                placeholder="Description"
                rows={3}
              />
            </div>
            <div className={styles.contextActions}>
              <button className={styles.cancelGenBtn} onClick={() => setGenPhase('idle')}>Cancel</button>
              <button
                className={styles.generateBtn}
                onClick={handleConfirmContext}
                disabled={!draftTitle.trim()}
              >
                Confirm &amp; generate questions
              </button>
            </div>
          </div>
        )}

        {genPhase === 'generating' && (
          <div className={styles.genStatus}>
            <div className={styles.spinner} />
            <span>Generating questions…</span>
          </div>
        )}

        {genError && (
          <div className={styles.genError}>
            <strong>Error:</strong> {genError}
            <button className={styles.retryBtn} onClick={() => setGenPhase('idle')}>Retry</button>
          </div>
        )}

        {(genPhase === 'done' || hasQuestions) && totalTokens > 0 && (
          <div className={styles.statLine}>
            Generated in {(totalMs / 1000).toFixed(1)}s · {totalTokens.toLocaleString()} tokens
          </div>
        )}

        {/* Study tabs */}
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
                  <button className={styles.startBtn} onClick={() => setActiveAttempt('quiz')} disabled={studyQuestions.length === 0}>
                    Start Quiz ({studyQuestions.length} questions)
                  </button>
                </div>
              )}

              {tab === 'test' && (
                <div className={styles.modeCard}>
                  <p className={styles.modeDesc}>Answer all questions without hints — results revealed at the end.</p>
                  <button className={styles.startBtn} onClick={() => setActiveAttempt('test')} disabled={studyQuestions.length === 0}>
                    Start Test ({studyQuestions.length} questions)
                  </button>
                </div>
              )}
            </div>

            {/* Attempts history */}
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

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
