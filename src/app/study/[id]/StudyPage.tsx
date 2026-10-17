"use client"

import type { Prep, Question, Asset } from "@prisma/client"

import PrepHeader from "@/components/prep/PrepHeader"
import PrepView from "@/components/prep/PrepView"
import { FLASHCARDS_TAB, QUESTIONS_TAB, type SharedTabData } from "@/components/prep/tabs/sharedTabs"
import { useUrlParams } from "@/lib/urlState"
import { parseStudyTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

interface Props {
  prep: Prep
  questions: Question[]
  assets: Asset[]
}

const STUDY_TABS = [ FLASHCARDS_TAB, QUESTIONS_TAB ]

/** Read-only view of a shared prep: the owner's prep view without editing, generation or usage controls. */
export default function StudyPage({ prep, questions, assets }: Props) {
  const { searchParams } = useUrlParams()
  const studyQuestions = questions.filter(q => q.type !== "flashcard")

  return (
    <PrepView
      prepId={prep.id}
      studyQuestions={studyQuestions}
      assets={assets}
      header={<PrepHeader prep={prep} tokensUsed={0} costUsd={0} actions={null} />}
      tab={parseStudyTab(searchParams.get("tab"))}
      tabs={STUDY_TABS}
      startAttemptButton
      tabData={(): SharedTabData => ({
        flashcards: questions.filter(q => q.type === "flashcard").map(q => q.content as unknown as FlashcardContent),
        studyQuestions,
        assets,
        generationOfQuestion: () => null,
        generationOfFlashcard: () => null,
      })}
    />
  )
}
