"use client"

import { PrepEntryCard } from "@/components/prep/PrepEntryCard"
import { PrepFilterBar, usePrepFilters } from "@/components/prep/PrepFilters"
import type { PrepEntry } from "@/repositories/prepRepository"

interface Props {
  entries: PrepEntry[]
}

export default function CatalogPage({ entries }: Props) {
  const filters = usePrepFilters(entries)

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-7 px-6 py-10 pb-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1.5 font-highlight text-2xl font-bold tracking-tight">Study Catalog</h2>
          <p className="text-sm text-muted-foreground">Browse publicly shared study sets</p>
        </div>
      </div>

      <PrepFilterBar filters={filters} />

      {filters.filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {entries.length === 0
            ? "No public preps yet. Be the first to share one!"
            : "No preps match the selected filters."}
        </div>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {filters.filtered.map(entry => (
            <li key={entry.id}>
              <PrepEntryCard entry={entry} href={`/study/${entry.id}`} showVisibility={false} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
