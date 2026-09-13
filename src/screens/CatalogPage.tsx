'use client'

import Link from 'next/link'
import type { CatalogEntry } from '../repositories/prepRepository'
import { DISCIPLINES, isDiscipline, type Discipline } from '../lib/agents/PrepLabeler'
import { disciplineFromEnum } from '../lib/disciplineMapping'
import { useUrlParams } from '../lib/urlState'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

const ALL_GRADES = Array.from({ length: 13 }, (_, i) => i + 1)
const ALL_GRADES_VALUE = 'all-grades'
const ALL_DISCIPLINES_VALUE = 'all-disciplines'
const ALL_LANGUAGES_VALUE = 'all-languages'

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

function parseGradeFilter(value: string | null): number | undefined {
  if (value === null) return undefined
  const grade = Number(value)
  return ALL_GRADES.includes(grade) ? grade : undefined
}

function parseDisciplineFilter(value: string | null): Discipline | undefined {
  return value !== null && isDiscipline(value) ? value : undefined
}

function parseLanguageFilter(value: string | null, availableLanguages: string[]): string | undefined {
  return value !== null && availableLanguages.includes(value) ? value : undefined
}

export default function CatalogPage({ entries }: Props) {
  const { searchParams, set: setUrlParams } = useUrlParams()

  const availableLanguages = [...new Set(entries.map(e => e.language).filter((l): l is string => !!l))]

  const gradeFilter = parseGradeFilter(searchParams.get('grade'))
  const disciplineFilter = parseDisciplineFilter(searchParams.get('discipline'))
  const languageFilter = parseLanguageFilter(searchParams.get('language'), availableLanguages)

  function setFilter(key: 'grade' | 'discipline' | 'language', value: string | undefined) {
    setUrlParams({ [key]: value })
  }

  const displayEntries = entries.map(e => ({ ...e, discipline: disciplineFromEnum(e.discipline) }))

  const filtered = displayEntries.filter(e => {
    if (gradeFilter !== undefined && e.grade !== gradeFilter) return false
    if (disciplineFilter !== undefined && e.discipline !== disciplineFilter) return false
    if (languageFilter !== undefined && e.language !== languageFilter) return false
    return true
  })

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border px-6 py-4">
        <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
          <Link href="/">← Home</Link>
        </Button>
        <h1 className="m-0 text-base font-bold tracking-tight">Prepify</h1>
        <div className="flex-1" />
      </header>

      <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-7 px-6 py-10 pb-16">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="mb-1.5 text-2xl font-bold tracking-tight">Study Catalog</h2>
            <p className="text-sm text-muted-foreground">Browse publicly shared study sets</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={gradeFilter === undefined ? ALL_GRADES_VALUE : String(gradeFilter)}
            onValueChange={v => setFilter('grade', v === ALL_GRADES_VALUE ? undefined : v)}
          >
            <SelectTrigger aria-label="Filter by grade" className="min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_GRADES_VALUE}>All grades</SelectItem>
              {ALL_GRADES.map(g => (
                <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={disciplineFilter === undefined ? ALL_DISCIPLINES_VALUE : disciplineFilter}
            onValueChange={v => setFilter('discipline', v === ALL_DISCIPLINES_VALUE ? undefined : v)}
          >
            <SelectTrigger aria-label="Filter by subject" className="min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DISCIPLINES_VALUE}>All subjects</SelectItem>
              {DISCIPLINES.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {availableLanguages.length > 1 && (
            <Select
              value={languageFilter === undefined ? ALL_LANGUAGES_VALUE : languageFilter}
              onValueChange={v => setFilter('language', v === ALL_LANGUAGES_VALUE ? undefined : v)}
            >
              <SelectTrigger aria-label="Filter by language" className="min-w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_LANGUAGES_VALUE}>All languages</SelectItem>
                {availableLanguages.map(l => (
                  <SelectItem key={l} value={l}>{LANGUAGE_LABELS[l] ?? l.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {entries.length === 0
              ? 'No public preps yet. Be the first to share one!'
              : 'No preps match the selected filters.'}
          </div>
        ) : (
          <ul className="grid list-none grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 p-0 m-0" role="list">
            {filtered.map(entry => (
              <li key={entry.id}>
                <Link
                  href={`/study/${entry.id}`}
                  className="flex h-full flex-col gap-2.5 rounded-lg border border-border bg-background p-5 text-inherit no-underline transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary"
                >
                  <div className="flex min-h-[22px] flex-wrap gap-1.5">
                    {entry.discipline && (
                      <span className="rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">{entry.discipline}</span>
                    )}
                    {entry.grade && (
                      <span className="rounded-full border border-primary bg-primary/10 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">Grade {entry.grade}</span>
                    )}
                  </div>
                  <h3 className="flex-1 text-[0.97rem] leading-snug font-semibold">{entry.title}</h3>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{entry.questionCount} questions</span>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
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
