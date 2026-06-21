import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import type { Question, FlashcardContent } from '../types/questions'
import FlashCard from '../components/questions/FlashCard'
import AttemptFlow from '../components/attempt/AttemptFlow'
import styles from './StudyPage.module.css'

type Tab = 'cards' | 'quiz' | 'test'

export default function StudyPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [prep, setPrep] = useState<Prep | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('cards')
  const [activeAttempt, setActiveAttempt] = useState<'quiz' | 'test' | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('preps').select('*').eq('id', id).single(),
      supabase.from('questions').select('*').eq('prep_id', id).order('created_at'),
    ]).then(([{ data: prepData }, { data: qData }]) => {
      setPrep(prepData)
      setQuestions((qData ?? []) as Question[])
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <div className={styles.center}><div className={styles.spinner} /></div>
  }

  if (!prep) {
    return (
      <div className={styles.center}>
        <p className={styles.notFoundText}>This prep is not available.</p>
        <button className={styles.back} onClick={() => navigate('/')}>← Home</button>
      </div>
    )
  }

  const flashcards = questions.filter(q => q.type === 'flashcard').map(q => q.content as FlashcardContent)
  const studyQuestions = questions.filter(q => q.type !== 'flashcard')

  if (activeAttempt) {
    return (
      <div className={styles.root}>
        <header className={styles.header}>
          <button className={styles.back} onClick={() => setActiveAttempt(null)}>← Back to Study</button>
          {!userId && (
            <span className={styles.anonNote}>Sign in to save your results</span>
          )}
        </header>
        <main className={styles.main}>
          <AttemptFlow
            questions={studyQuestions}
            mode={activeAttempt}
            prepId={prep.id}
            userId={userId}
            onExit={() => setActiveAttempt(null)}
          />
        </main>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/')}>← Home</button>
        {!userId && (
          <span className={styles.anonNote}>Sign in to track your progress</span>
        )}
      </header>

      <main className={styles.main}>
        <div className={styles.meta}>
          <h1 className={styles.title}>{prep.title}</h1>
          {prep.study_description && (
            <p className={styles.description}>{prep.study_description}</p>
          )}
        </div>

        {questions.length === 0 ? (
          <p className={styles.empty}>No questions available yet.</p>
        ) : (
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
          </>
        )}
      </main>
    </div>
  )
}
