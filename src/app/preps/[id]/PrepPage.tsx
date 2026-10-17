"use client"

import type { Prep, Question, Attempt, Asset, PrepImage } from "@prisma/client"
import { useSession } from "next-auth/react"
import { useState } from "react"

import PrepHeader from "@/components/prep/PrepHeader"
import PrepView, { PREP_MAIN_CLASS } from "@/components/prep/PrepView"
import { describeOcrError } from "@/lib/ocrRejection"
import { useUrlParams } from "@/lib/urlState"
import { useSyncedState } from "@/lib/useSyncedState"
import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"
import { parsePrepTab, ocrResultSchema } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

import DeletePrepDialog from "./DeletePrepDialog"
import DraftPrep from "./DraftPrep"
import SharePrepDialog from "./SharePrepDialog"
import { PREP_TAB_REGISTRY } from "./tabs/registry"
import type { PageEntry } from "./tabs/types"
import { usePrepMe } from "./usePrepMe"

/** The generation of the job that produced an entity; null when that job is gone. */
function generationOf(jobId: string | null, generations: Record<string, JobGeneration>): JobGeneration | null {
  if (jobId === null) return null
  return generations[jobId] ?? null
}

function toPageEntry(img: PrepImage, number: number, generations: Record<string, JobGeneration>, rejectedGenerations: Record<string, JobGeneration>): PageEntry | null {
  if (img.status === "failed") {
    if (!img.error) throw new Error(`PrepImage ${img.id} failed without an error`)
    return { verdict: "rejected", number, gcsKey: img.gcsKey, reason: describeOcrError(img.error), generation: rejectedGenerations[img.id] ?? null }
  }
  if (img.ocrResult === null) return null
  if (!img.language) throw new Error(`PrepImage ${img.id} has an OCR result but no language`)
  const page = { page: number, gcsKey: img.gcsKey, language: img.language, ...ocrResultSchema.parse(img.ocrResult) }
  return { verdict: "accepted", page, generation: generationOf(img.producedByJobId, generations) }
}

function toPages(images: PrepImage[], generations: Record<string, JobGeneration>, rejectedGenerations: Record<string, JobGeneration>): PageEntry[] {
  return images
    .map((img, i) => toPageEntry(img, i + 1, generations, rejectedGenerations))
    .filter(entry => entry !== null)
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
  /** Wasted OCR calls by rejected image id. */
  rejectedGenerations: Record<string, JobGeneration>
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
  rejectedGenerations,
}: Props) {
  const { searchParams, set: setUrlParams } = useUrlParams()
  const { data: session } = useSession()
  const userId = session?.user.id ?? null

  const [ prep, setPrep ] = useSyncedState(serverPrep)
  const [ questions, setQuestions ] = useSyncedState(serverQuestions)
  const [ shareOpen, setShareOpen ] = useState(false)
  const [ deleteOpen, setDeleteOpen ] = useState(false)
  const prepMe = usePrepMe(prep.id, images.length)

  const studyQuestions = questions.filter(q => q.type !== "flashcard")
  const isOwner = prep.userId === userId
  // A run in flight keeps the draft view up: activating the prep mid-run would otherwise unmount it.
  const showDraft = (!prep.isActive && progress === null) || prepMe.phase !== null

  if (showDraft) {
    return (
      <main className={PREP_MAIN_CLASS}>
        <PrepHeader
          prep={prep}
          tokensUsed={0}
          costUsd={0}
          actions={isOwner ? { canShare: false, onShare: () => setShareOpen(true), onDelete: () => setDeleteOpen(true) } : null}
        />
        <DraftPrep prepId={prep.id} images={images} prepMe={prepMe} />
        <DeletePrepDialog prep={prep} open={deleteOpen} onOpenChange={setDeleteOpen} />
      </main>
    )
  }

  return (
    <PrepView
      prepId={prep.id}
      studyQuestions={studyQuestions}
      assets={assets}
      header={
        <PrepHeader
          prep={prep}
          tokensUsed={tokensUsed}
          costUsd={costUsd}
          actions={isOwner ? { canShare: questions.length > 0, onShare: () => setShareOpen(true), onDelete: () => setDeleteOpen(true) } : null}
        />
      }
      tab={parsePrepTab(searchParams.get("tab"))}
      tabs={PREP_TAB_REGISTRY}
      startAttemptButton={false}
      tabData={onStartAttempt => ({
        prep,
        questions,
        flashcards: questions.filter(q => q.type === "flashcard").map(q => q.content as unknown as FlashcardContent),
        studyQuestions,
        attempts,
        assets,
        progress,
        concepts,
        pages: toPages(images, generations, rejectedGenerations),
        generations,
        generationOfQuestion: q => generationOf(q.producedByJobId, generations),
        onTitleReady: title => setPrep(p => ({ ...p, title })),
        onGenerated: (savedQuestions, freshPrep) => {
          setQuestions(savedQuestions)
          setPrep(freshPrep)
        },
        onStartAttempt,
        onOpenTab: tab => setUrlParams({ tab }),
      })}
    >
      <DeletePrepDialog prep={prep} open={deleteOpen} onOpenChange={setDeleteOpen} />
      {shareOpen && isOwner && (
        <SharePrepDialog prep={prep} onSaved={setPrep} onClose={() => setShareOpen(false)} />
      )}
    </PrepView>
  )
}
