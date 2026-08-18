'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CatalogEntry } from '../repositories/prepRepository'
import { DISCIPLINES } from '../lib/agents/PrepLabeler'
import { disciplineFromEnum } from '../lib/disciplineMapping'
import styles from './CatalogPage.module.css'

const ALL_GRADES = Array.from({ length: 13 }, (_, i) => i + 1)

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  pl: 'Polski',
  nl: 'Nederlands',
  pt: 'Português',
  ru: 'Русский',
  uk: 'Українська',
  cs: 'Čeština',
  sk: 'Slovenčina',
  ro: 'Română',
  hu: 'Magyar',
  tr: 'Türkçe',
}

interface Props {
  entries: CatalogEntry[]
}

export default function CatalogPage({ entries }: Props) {
  const router = useRouter()

  const [gradeFilter, setGradeFilter] = useState<number | ''>('')
  const [disciplineFilter, setDisciplineFilter] = useState<string>('')
  const [languageFilter, setLanguageFilter] = useState<string>('')

  const displayEntries = entries.map(e => ({ ...e, discipline: disciplineFromEnum(e.discipline) }))

  const filtered = displayEntries.filter(e => {
    if (gradeFilter !== '' && e.grade !== gradeFilter) return false
    if (disciplineFilter !== '' && e.discipline !== disciplineFilter) return false
    if (languageFilter !== '' && e.language !== languageFilter) return false
    return true
  })

  const availableLanguages = [...new Set(entries.map(e => e.language).filter((l): l is string => !!l))]

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => router.push('/')}>← Home</button>
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

          {availableLanguages.length > 1 && (
            <select
              className={styles.select}
              value={languageFilter}
              onChange={e => setLanguageFilter(e.target.value)}
              aria-label="Filter by language"
            >
              <option value="">All languages</option>
              {availableLanguages.map(l => (
                <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l.toUpperCase()}</option>
              ))}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {entries.length === 0
              ? 'No public preps yet. Be the first to share one!'
              : 'No preps match the selected filters.'}
          </div>
        ) : (
          <ul className={styles.grid} role="list">
            {filtered.map(entry => (
              <li key={entry.id}>
                <Link href={`/study/${entry.id}`} className={styles.card}>
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
                    <span className={styles.cardStat}>{entry.questionCount} questions</span>
                    <span className={styles.cardDate}>{formatDate(entry.createdAt)}</span>
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

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
