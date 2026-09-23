"use client"

import type { Prep, PrepVisibility } from "@prisma/client"
import { BookOpenIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardBadge, CardBadges, CardFooter, CardSubtitle, CardTitle } from "@/components/ui/card"
import UploadModal from "@/components/UploadModal"
import { formatDate } from "@/lib/format"

const VISIBILITY_BADGE: Record<PrepVisibility, { label: string; className: string }> = {
  private: { label: "private", className: "border-border text-muted-foreground" },
  link:    { label: "link only", className: "border-primary/40 bg-primary/10 text-primary" },
  public:  { label: "public", className: "border-success/40 bg-success/10 text-success" },
}

function PrepCard({ prep }: { prep: Prep }) {
  const { label, className } = VISIBILITY_BADGE[prep.visibility]
  return (
    <li>
      <Card href={`/preps/${prep.id}`}>
        <CardBadges>
          <CardBadge className={className}>{label}</CardBadge>
        </CardBadges>
        <CardTitle>{prep.title}</CardTitle>
        {prep.description && <CardSubtitle>{prep.description}</CardSubtitle>}
        <CardFooter>
          <span className="text-xs text-muted-foreground">{formatDate(prep.createdAt)}</span>
        </CardFooter>
      </Card>
    </li>
  )
}

interface Props {
  preps: Prep[]
}

export default function MyPreps({ preps }: Props) {
  const [ showUpload, setShowUpload ] = useState(false)
  const router = useRouter()

  function handleDone(prepId: string) {
    setShowUpload(false)
    router.push(`/preps/${prepId}`)
  }

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
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {preps.map(prep => (
              <PrepCard key={prep.id} prep={prep} />
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
