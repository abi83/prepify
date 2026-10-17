"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LANGUAGE_LABELS } from "@/core/lib/config"
import { DISCIPLINES, isDiscipline, type Discipline } from "@/lib/agents/PrepMeta"
import { disciplineFromEnum } from "@/lib/disciplineMapping"
import { useUrlParams } from "@/lib/urlState"
import type { PrepEntry } from "@/repositories/prepRepository"
import type { SupportedLanguage } from "@/types/language"

const ALL_GRADES = Array.from({ length: 13 }, (_, i) => i + 1)
const ALL_GRADES_VALUE = "all-grades"
const ALL_DISCIPLINES_VALUE = "all-disciplines"
const ALL_LANGUAGES_VALUE = "all-languages"

function parseGradeFilter(value: string | null): number | undefined {
  if (value === null) return undefined
  const grade = Number(value)
  return ALL_GRADES.includes(grade) ? grade : undefined
}

function parseDisciplineFilter(value: string | null): Discipline | undefined {
  return value !== null && isDiscipline(value) ? value : undefined
}

function parseLanguageFilter(value: string | null, availableLanguages: SupportedLanguage[]): SupportedLanguage | undefined {
  return availableLanguages.find(l => l === value)
}

/** Filter state lives in the URL; filtering itself is client-side over the entries the server page passed down. */
export function usePrepFilters(entries: PrepEntry[]) {
  const { searchParams, set: setUrlParams } = useUrlParams()

  const availableLanguages = [ ...new Set(entries.map(e => e.language).filter(l => l !== null)) ]

  const gradeFilter = parseGradeFilter(searchParams.get("grade"))
  const disciplineFilter = parseDisciplineFilter(searchParams.get("discipline"))
  const languageFilter = parseLanguageFilter(searchParams.get("language"), availableLanguages)

  const filtered = entries.filter(e => {
    if (gradeFilter !== undefined && e.grade !== gradeFilter) return false
    if (disciplineFilter !== undefined && disciplineFromEnum(e.discipline) !== disciplineFilter) return false
    if (languageFilter !== undefined && e.language !== languageFilter) return false
    return true
  })

  function setFilter(key: "grade" | "discipline" | "language", value: string | undefined) {
    setUrlParams({ [key]: value })
  }

  return { filtered, gradeFilter, disciplineFilter, languageFilter, availableLanguages, setFilter }
}

export function PrepFilterBar({ filters }: { filters: ReturnType<typeof usePrepFilters> }) {
  const { gradeFilter, disciplineFilter, languageFilter, availableLanguages, setFilter } = filters
  return (
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
              <SelectItem key={l} value={l}>{LANGUAGE_LABELS[l]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
