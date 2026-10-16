"use client"

import type { Prep, Question, Attempt, Asset, PrepImage } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState } from "react"

import AttemptFlow from "@/components/attempt/AttemptFlow"
import { Button } from "@/components/ui/button"
import { useUrlParams } from "@/lib/urlState"
import { useSyncedState } from "@/lib/useSyncedState"
import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"
import { parsePrepTab, ocrResultSchema, type PrepTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

import DeletePrepDialog from "./DeletePrepDialog"
import DraftPrep from "./DraftPrep"
import PrepHeader from "./PrepHeader"
import PrepTabs from "./PrepTabs"
import SharePrepDialog from "./SharePrepDialog"
import { usePrepMe } from "./usePrepMe"

/** The generation of the job that produced an entity; null when that job is gone. */
function generationOf(jobId: string | null, generations: Record<string, JobGeneration>): JobGeneration | null {
  if (jobId === null) return null
  return generations[jobId] ?? null
}

function toPages(images: PrepImage[], generations: Record<string, JobGeneration>) {
  return images
    .filter(img => img.ocrResult !== null)
    .map((img, i) => {
      if (!img.language) throw new Error(`PrepImage ${img.id} has an OCR result but no language`)
      const page = { page: i + 1, gcsKey: img.gcsKey, language: img.language, ...ocrResultSchema.parse(img.ocrResult) }
      return { page, generation: generationOf(img.producedByJobId, generations) }
    })
}

interface Props {
  prep: Prep
  questions: Question[]
  attempts: Attempt[]
  assets: Asset[]
  progress: PrepProgress | null
  tokensUsed: number
  costUsd: number
  concepts: StatedConcept[]
  images: PrepImage[]
  generations: Record<string, JobGeneration>
}

export default function PrepPage({
  prep: serverPrep,
  questions: serverQuestions,
  attempts,
  assets,
  progress,
  tokensUsed,
  costUsd,
  concepts,
  images,
  generations,
}: Props) {
  const router = useRouter()
  const { searchParams, set: setUrlParams } = useUrlParams()
  const { data: session } = useSession()
  const userId = session?.user.id ?? null

  const [ prep, setPrep ] = useSyncedState(serverPrep)
  const [ questions, setQuestions ] = useSyncedState(serverQuestions)
  const [ activeAttempt, setActiveAttempt ] = useState(false)
  const [ shareOpen, setShareOpen ] = useState(false)
  const [ deleteOpen, setDeleteOpen ] = useState(false)
  const prepMe = usePrepMe(prep.id, images.length)

  const studyQuestions = questions.filter(q => q.type !== "flashcard")
  const isOwner = prep.userId === userId
  // A run in flight keeps the draft view up: activating the prep mid-run would otherwise unmount it.
  const showDraft = (!prep.isActive && progress === null) || prepMe.phase !== null

  function handleExitAttempt() {
    setActiveAttempt(false)
    router.refresh()
  }

  if (activeAttempt && userId) {
    return (
      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-4 py-10 sm:px-6">
        <Button variant="link" className="h-11 self-start p-0 text-muted-foreground" onClick={handleExitAttempt}>
          ← Back to Prep
        </Button>
        <AttemptFlow questions={studyQuestions} assets={assets} prepId={prep.id} userId={userId} onExit={handleExitAttempt} />
      </main>
    )
  }

  if (showDraft) {
    return (
      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <PrepHeader
          prep={prep}
          isOwner={isOwner}
          canShare={false}
          tokensUsed={0}
          costUsd={0}
          onShare={() => setShareOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
        <DraftPrep prepId={prep.id} images={images} prepMe={prepMe} />
        <DeletePrepDialog prep={prep} open={deleteOpen} onOpenChange={setDeleteOpen} />
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
      <PrepHeader
        prep={prep}
        isOwner={isOwner}
        canShare={questions.length > 0}
        tokensUsed={tokensUsed}
        costUsd={costUsd}
        onShare={() => setShareOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <PrepTabs
        tab={parsePrepTab(searchParams.get("tab"))}
        onTabChange={(tab: PrepTab) => setUrlParams({ tab })}
        data={{
          prep,
          questions,
          flashcards: questions.filter(q => q.type === "flashcard").map(q => q.content as unknown as FlashcardContent),
          studyQuestions,
          attempts,
          assets,
          progress,
          concepts,
          pages: toPages(images, generations),
          generations,
          generationOfQuestion: q => generationOf(q.producedByJobId, generations),
          onTitleReady: title => setPrep(p => ({ ...p, title })),
          onGenerated: (savedQuestions, freshPrep) => {
            setQuestions(savedQuestions)
            setPrep(freshPrep)
          },
          onStartAttempt: () => setActiveAttempt(true),
          onOpenTab: tab => setUrlParams({ tab }),
        }}
      />

      <DeletePrepDialog prep={prep} open={deleteOpen} onOpenChange={setDeleteOpen} />
      {shareOpen && isOwner && (
        <SharePrepDialog prep={prep} onSaved={setPrep} onClose={() => setShareOpen(false)} />
      )}
    </main>
  )
}
