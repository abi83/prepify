"use client"

import type { Prep, Question, Attempt, Asset, PrepImage } from "@prisma/client"
import { useState } from "react"
import { toast } from "sonner"

import PrepHeader from "@/components/prep/PrepHeader"
import PrepView, { PREP_MAIN_CLASS } from "@/components/prep/PrepView"
import { generationOf, toFlashcardQuestions, toFlashcards, toStudyQuestions } from "@/components/prep/tabs/sharedTabs"
import { describeOcrError } from "@/lib/ocrRejection"
import { useUrlParams } from "@/lib/urlState"
import { useSyncedState } from "@/lib/useSyncedState"
import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"
import { parsePrepTab, ocrResultSchema } from "@/types/prep"

import DeletePrepDialog from "./DeletePrepDialog"
import DraftPrep from "./DraftPrep"
import SharePrepDialog from "./SharePrepDialog"
import { PREP_TAB_REGISTRY } from "./tabs/registry"
import type { PageEntry } from "./tabs/types"
import { usePrepMe } from "./usePrepMe"
import { useRunProgress } from "./useRunProgress"

function toPageEntry(img: PrepImage, number: number, generations: Record<string, JobGeneration>, rejectedGenerations: Record<string, JobGeneration>): PageEntry | null {
  if (img.status === "failed") {
    if (!img.error) throw new Error(`PrepImage ${img.id} failed without an error`)
    return { verdict: "rejected", imageId: img.id, number, gcsKey: img.gcsKey, reason: describeOcrError(img.error), generation: rejectedGenerations[img.id] ?? null }
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

const reportStreamError = (e: Error) => toast.error(e.message)

interface Props {
  userId: string
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
  userId,
  prep: serverPrep,
  questions: serverQuestions,
  attempts,
  assets,
  progress: serverProgress,
  tokensUsed,
  costUsd,
  concepts,
  images,
  generations,
  rejectedGenerations,
}: Props) {
  const { searchParams, set: setUrlParams } = useUrlParams()

  const [ prep, setPrep ] = useSyncedState(serverPrep)
  const [ questions, setQuestions ] = useSyncedState(serverQuestions)
  const [ shareOpen, setShareOpen ] = useState(false)
  const [ deleteOpen, setDeleteOpen ] = useState(false)
  const { progress, refresh: refreshProgress, expectRun } = useRunProgress(serverPrep.id, serverProgress, reportStreamError)
  const prepMe = usePrepMe(prep.id, images.length, expectRun)

  const studyQuestions = toStudyQuestions(questions)
  const flashcardQuestions = toFlashcardQuestions(questions)
  const isOwner = prep.userId === userId
  // A run in flight keeps the draft view up: activating the prep mid-run would otherwise unmount it.
  const showDraft = (!prep.isActive && serverProgress === null) || prepMe.phase !== null

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
      userId={userId}
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
      tabData={onStartAttempt => ({
        prep,
        questions,
        flashcards: toFlashcards(questions),
        studyQuestions,
        attempts,
        assets,
        progress,
        refreshProgress,
        expectRun,
        concepts,
        pages: toPages(images, generations, rejectedGenerations),
        generations,
        generationOfQuestion: q => generationOf(q.producedByJobId, generations),
        generationOfFlashcard: i => generationOf(flashcardQuestions[i].producedByJobId, generations),
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
