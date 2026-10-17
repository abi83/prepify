"use client"

import { BookOpenIcon } from "lucide-react"
import { useState } from "react"

import { PrepEntryCard } from "@/components/prep/PrepEntryCard"
import { PrepFilterBar, usePrepFilters } from "@/components/prep/PrepFilters"
import { Button } from "@/components/ui/button"
import UploadModal from "@/components/UploadModal"
import type { PrepEntry } from "@/repositories/prepRepository"

interface Props {
  preps: PrepEntry[]
}

export default function MyPreps({ preps }: Props) {
  const [ showUpload, setShowUpload ] = useState(false)
  const filters = usePrepFilters(preps)

  return (
    <>
      <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-highlight text-2xl font-bold">My Preps</h1>
          <Button onClick={() => setShowUpload(true)}>+ New Prep</Button>
        </div>

        {preps.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <BookOpenIcon className="size-10 text-muted-foreground/50" />
            <div className="flex flex-col gap-1">
              <p className="text-base font-medium">No preps yet</p>
              <p className="max-w-[280px] text-sm text-muted-foreground">
                Upload a photo of a textbook page to generate study questions.
              </p>
            </div>
            <Button onClick={() => setShowUpload(true)}>Upload your first page</Button>
          </div>
        ) : (
          <>
            <PrepFilterBar filters={filters} />
            {filters.filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No preps match the selected filters.</div>
            ) : (
              <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filters.filtered.map(prep => (
                  <li key={prep.id}>
                    <PrepEntryCard entry={prep} href={`/preps/${prep.id}`} showVisibility />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} />
      )}
    </>
  )
}
