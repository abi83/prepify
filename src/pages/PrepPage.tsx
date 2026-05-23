import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import type { Question, Attempt, FlashcardContent } from '../types/questions'
import type { PipelineProgressEvent } from '../types/pipeline'
import { getApiKey } from '../lib/apiKey'
import { runPipeline } from '../lib/pipeline'
import FlashCard from '../components/questions/FlashCard'
import AttemptFlow from '../components/attempt/AttemptFlow'
import styles from './PrepPage.module.css'

type Tab = 'cards' | 'quiz' | 'test'
type GenPhase = 'idle' | 'running' | 'done'

function getProgressLabel(progress: PipelineProgressEvent | null): string {
  if (!progress) return 'Starting…'
  switch (progress.stage) {
    case 'concepts': return 'Extracting concepts…'
    case 'crafting': return `Crafting questions (${progress.done}/${progress.total})…`
    case 'reviewing': return `Validating questions (${progress.done}/${progress.total})…`
    case 'done': return 'Done'
  }
}

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
    ]).then(([{ data: prepData }, { data: qData }, { data: aData }]) => {
      setPrep(prepData)
      setQuestions((qData ?? []) as Question[])
      setAttempts((aData ?? []) as Attempt[])
      setLoading(false)
    })
  }, [id])

  async function handleGenerate() {
    const keyConfig = getApiKey()
    if (!keyConfig) {
      navigate('/settings', { state: { returnTo: `/preps/${id}` } })
      return
    }

    setGenError(null)
    setPipelineProgress(null)
    abortRef.current = new AbortController()
    genStartRef.current = performance.now()
    setGenPhase('running')

    try {
      const result = await runPipeline({
        rawText: prep!.raw_text,
        apiKey: keyConfig.key,
        model: keyConfig.model,
        signal: abortRef.current.signal,
        onProgress: (event) => setPipelineProgress(event),
      })

      const elapsed = Math.round(performance.now() - genStartRef.current)

      const rows = result.questions.map(q => ({ prep_id: id!, type: q.type, content: q.content }))
      const { data: saved } = await supabase.from('questions').insert(rows).select()
      setQuestions((saved ?? []) as Question[])

      if (result.prepTitle) {
        await supabase.from('preps').update({ title: result.prepTitle }).eq('id', id!)
        setPrep(p => p ? { ...p, title: result.prepTitle! } : p)
      }

      setGenMs(elapsed)
      setTotalTokens(result.totalTokens)
      setGenPhase('done')
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') setGenError((e as Error).message)
      setGenPhase('idle')
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

        {!hasQuestions && genPhase === 'idle' && (
          <div className={styles.generateArea}>
            <p className={styles.generateHint}>Generate study questions from this material.</p>
            <button className={styles.generateBtn} onClick={handleGenerate}>
              Generate questions
            </button>
          </div>
        )}

        {genPhase === 'running' && (
          <div className={styles.genStatus}>
            <div className={styles.spinner} />
            <span>{getProgressLabel(pipelineProgress)}</span>
            <button
              className={styles.cancelGenBtn}
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </button>
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
