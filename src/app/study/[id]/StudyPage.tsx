"use client"

import type { Prep, Question, Asset } from "@prisma/client"

import PrepHeader from "@/components/prep/PrepHeader"
import PrepView from "@/components/prep/PrepView"
import { generationOf, SHARED_TABS, toFlashcardQuestions, toFlashcards, toStudyQuestions, type SharedTabData } from "@/components/prep/tabs/sharedTabs"
import { useUrlParams } from "@/lib/urlState"
import type { JobGeneration, StatedConcept } from "@/repositories/prepStateRepository"
import { parseStudyTab } from "@/types/prep"

interface Props {
  userId: string | null
  prep: Prep
  questions: Question[]
  assets: Asset[]
  concepts: StatedConcept[]
  generations: Record<string, JobGeneration>
  tokensUsed: number
  costUsd: number
}

/** Read-only view of a shared prep: the owner's prep view without editing, generation control or owner data. */
export default function StudyPage({ userId, prep, questions, assets, concepts, generations, tokensUsed, costUsd }: Props) {
  const { searchParams, set: setUrlParams } = useUrlParams()
  const studyQuestions = toStudyQuestions(questions)
  const flashcardQuestions = toFlashcardQuestions(questions)

  return (
    <PrepView
      prepId={prep.id}
      userId={userId}
      studyQuestions={studyQuestions}
      assets={assets}
      header={<PrepHeader prep={prep} tokensUsed={tokensUsed} costUsd={costUsd} actions={null} />}
      tab={parseStudyTab(searchParams.get("tab"))}
      tabs={SHARED_TABS}
      tabData={(onStartAttempt): SharedTabData => ({
        flashcards: toFlashcards(questions),
        studyQuestions,
        assets,
        concepts,
        generationOfQuestion: q => generationOf(q.producedByJobId, generations),
        generationOfFlashcard: i => generationOf(flashcardQuestions[i].producedByJobId, generations),
        onStartAttempt,
        onOpenTab: tab => setUrlParams({ tab }),
      })}
    />
  )
}
