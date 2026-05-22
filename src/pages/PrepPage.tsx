import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import styles from './PrepPage.module.css'

export default function PrepPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [prep, setPrep] = useState<Prep | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('preps')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setPrep(data)
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
      </div>
    )
  }

  if (!prep) {
    return (
      <div className={styles.center}>
        <p>Prep not found.</p>
        <button className={styles.back} onClick={() => navigate('/preps')}>← Back to My Preps</button>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/preps')}>← My Preps</button>
      </header>

      <main className={styles.main}>
        <div className={styles.meta}>
          <h1 className={styles.title}>{prep.title}</h1>
          <span className={styles.date}>{formatDate(prep.created_at)}</span>
        </div>

        <div className={styles.textCard}>
          <div className={styles.textHeader}>
            <span className={styles.textLabel}>Extracted text</span>
            <button
              className={styles.toggle}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          <div className={`${styles.textBody} ${expanded ? styles.expanded : ''}`}>
            <pre className={styles.pre}>{prep.raw_text}</pre>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.studyBtn} disabled>
            Study — coming soon
          </button>
        </div>
      </main>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
