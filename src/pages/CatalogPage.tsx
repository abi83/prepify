import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DISCIPLINES } from '../lib/agents/PrepLabeler'
import styles from './CatalogPage.module.css'

type CatalogEntry = {
  id: string
  title: string
  grade: number | null
  discipline: string | null
  created_at: string
  question_count: number
}

const ALL_GRADES = Array.from({ length: 13 }, (_, i) => i + 1)

export default function CatalogPage() {
  const navigate = useNavigate()

  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeFilter, setGradeFilter] = useState<number | ''>('')
  const [disciplineFilter, setDisciplineFilter] = useState<string>('')

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: preps } = await supabase
        .from('preps')
        .select('id, title, grade, discipline, created_at')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })

      if (!preps || preps.length === 0) {
        setEntries([])
        setLoading(false)
        return
      }

      const prepIds = preps.map((p: { id: string }) => p.id)
      const { data: questions } = await supabase
        .from('questions')
        .select('prep_id')
        .in('prep_id', prepIds)

      const countMap: Record<string, number> = {}
      for (const q of questions ?? []) {
        countMap[q.prep_id] = (countMap[q.prep_id] ?? 0) + 1
      }

      setEntries(
        preps.map((p: { id: string; title: string; grade: number | null; discipline: string | null; created_at: string }) => ({
          ...p,
          question_count: countMap[p.id] ?? 0,
        }))
      )
      setLoading(false)
    }

    load()
  }, [])

  const filtered = entries.filter(e => {
    if (gradeFilter !== '' && e.grade !== gradeFilter) return false
    if (disciplineFilter !== '' && e.discipline !== disciplineFilter) return false
    return true
  })

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate('/')}>← Home</button>
        <h1 className={styles.logo}>Prepify</h1>
        <div className={styles.headerSpacer} />
      </header>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <div>
            <h2 className={styles.pageTitle}>Study Catalog</h2>
            <p className={styles.pageSubtitle}>Browse publicly shared study sets</p>
          </div>
        </div>

        <div className={styles.filters}>
          <select
            className={styles.select}
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value === '' ? '' : Number(e.target.value))}
            aria-label="Filter by grade"
          >
            <option value="">All grades</option>
            {ALL_GRADES.map(g => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>

          <select
            className={styles.select}
            value={disciplineFilter}
            onChange={e => setDisciplineFilter(e.target.value)}
            aria-label="Filter by subject"
          >
            <option value="">All subjects</option>
            {DISCIPLINES.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className={styles.center}>
            <div className={styles.spinner} />
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            {entries.length === 0
              ? 'No public preps yet. Be the first to share one!'
              : 'No preps match the selected filters.'}
          </div>
        ) : (
          <ul className={styles.grid} role="list">
            {filtered.map(entry => (
              <li key={entry.id}>
                <Link to={`/study/${entry.id}`} className={styles.card}>
                  <div className={styles.cardMeta}>
                    {entry.discipline && (
                      <span className={styles.tag}>{entry.discipline}</span>
                    )}
                    {entry.grade && (
                      <span className={styles.tag}>Grade {entry.grade}</span>
                    )}
                  </div>
                  <h3 className={styles.cardTitle}>{entry.title}</h3>
                  <div className={styles.cardFooter}>
                    <span className={styles.cardStat}>{entry.question_count} questions</span>
                    <span className={styles.cardDate}>{formatDate(entry.created_at)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
