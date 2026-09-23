"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardBadge, CardBadges, CardFooter, CardSubtitle, CardTitle } from "@/components/ui/card"
import { DISCIPLINES, isDiscipline, type Discipline } from "@/lib/agents/PrepLabeler"
import { LANGUAGE_LABELS } from "@/lib/config"
import { disciplineFromEnum } from "@/lib/disciplineMapping"
import { formatDate } from "@/lib/format"
import { useUrlParams } from "@/lib/urlState"
import type { CatalogEntry } from "@/repositories/prepRepository"

const ALL_GRADES = Array.from({ length: 13 }, (_, i) => i + 1)
const ALL_GRADES_VALUE = "all-grades"
const ALL_DISCIPLINES_VALUE = "all-disciplines"
const ALL_LANGUAGES_VALUE = "all-languages"

type DisplayEntry = Omit<CatalogEntry, "discipline"> & { discipline: string | null }

function CatalogCard({ entry }: { entry: DisplayEntry }) {
  return (
    <Card href={`/study/${entry.id}`}>
      <CardBadges>
        {entry.discipline && <CardBadge className="border-primary/40 bg-primary/10 text-primary">{entry.discipline}</CardBadge>}
        {entry.grade && <CardBadge className="border-primary/40 bg-primary/10 text-primary">Grade {entry.grade}</CardBadge>}
      </CardBadges>
      <CardTitle>{entry.title}</CardTitle>
      {entry.description && <CardSubtitle>{entry.description}</CardSubtitle>}
      <CardFooter>
        <span className="text-xs text-muted-foreground">{entry.questionCount} questions</span>
        <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
      </CardFooter>
    </Card>
  )
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

  const availableLanguages = [ ...new Set(entries.map(e => e.language).filter((l): l is string => !!l)) ]

  const gradeFilter = parseGradeFilter(searchParams.get("grade"))
  const disciplineFilter = parseDisciplineFilter(searchParams.get("discipline"))
  const languageFilter = parseLanguageFilter(searchParams.get("language"), availableLanguages)

  function setFilter(key: "grade" | "discipline" | "language", value: string | undefined) {
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
    <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-7 px-6 py-10 pb-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 font-highlight text-2xl font-bold tracking-tight">Study Catalog</h2>
          <p className="text-sm text-muted-foreground">Browse publicly shared study sets</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={gradeFilter === undefined ? ALL_GRADES_VALUE : String(gradeFilter)}
          onValueChange={v => setFilter("grade", v === ALL_GRADES_VALUE ? undefined : v)}
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
          onValueChange={v => setFilter("discipline", v === ALL_DISCIPLINES_VALUE ? undefined : v)}
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
            onValueChange={v => setFilter("language", v === ALL_LANGUAGES_VALUE ? undefined : v)}
          >
            <SelectTrigger aria-label="Filter by language" className="min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LANGUAGES_VALUE}>All languages</SelectItem>
              {availableLanguages.map(l => (
                <SelectItem key={l} value={l}>{LANGUAGE_LABELS[l as keyof typeof LANGUAGE_LABELS] ?? l.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {entries.length === 0
            ? "No public preps yet. Be the first to share one!"
            : "No preps match the selected filters."}
        </div>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {filtered.map(entry => (
            <li key={entry.id}>
              <CatalogCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

