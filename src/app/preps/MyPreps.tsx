"use client"

import type { Prep, PrepVisibility } from "@prisma/client"
import { BookOpenIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { deletePrep } from "@/actions/preps"
import { Button } from "@/components/ui/button"
import UploadModal from "@/components/UploadModal"
import { formatDate } from "@/lib/format"

const VISIBILITY_STYLES: Record<PrepVisibility, string> = {
  private: "bg-muted text-muted-foreground",
  link: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  public: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
}

function VisibilityBadge({ visibility }: { visibility: PrepVisibility }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${VISIBILITY_STYLES[visibility]}`}>
      {visibility}
    </span>
  )
}

interface Props {
  preps: Prep[]
}

export default function MyPreps({ preps }: Props) {
  const [ showUpload, setShowUpload ] = useState(false)
  const [ confirmDeleteId, setConfirmDeleteId ] = useState<string | null>(null)
  const [ deleting, setDeleting ] = useState(false)
  const router = useRouter()

  function handleDone(prepId: string) {
    setShowUpload(false)
    router.push(`/preps/${prepId}`)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    await deletePrep(id)
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
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
          <ul className="flex flex-col gap-2">
            {preps.map(prep => (
              <li key={prep.id} className="flex items-stretch gap-2">
                <Link
                  href={`/preps/${prep.id}`}
                  className="flex flex-1 items-start justify-between gap-4 rounded-lg border border-border bg-background px-5 py-4 text-left transition-colors hover:border-primary hover:bg-muted"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-medium">{prep.title}</span>
                      <VisibilityBadge visibility={prep.visibility} />
                    </div>
                    {prep.description && (
                      <span className="truncate text-xs text-muted-foreground">{prep.description}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{formatDate(prep.createdAt)}</span>
                </Link>
                {confirmDeleteId === prep.id ? (
                  <div className="flex shrink-0 items-center gap-1.5 px-1">
                    <span className="text-sm whitespace-nowrap text-muted-foreground">Delete?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(prep.id)}
                      disabled={deleting}
                    >
                      {deleting ? "…" : "Yes"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleting}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(prep.id) }}
                    title="Delete prep"
                    aria-label="Delete prep"
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onDone={handleDone} />
      )}
    </>
  )
}
