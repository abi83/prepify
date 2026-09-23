"use client"

import type { Prep, Question, Asset } from "@prisma/client"
import { useSession } from "next-auth/react"
import { useState } from "react"

import AttemptFlow from "@/components/attempt/AttemptFlow"
import StudyTabs from "@/components/StudyTabs"
import { Button } from "@/components/ui/button"
import { useUrlParams } from "@/lib/urlState"
import { parseStudyTab, type StudyTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

interface Props {
  prep: Prep
  questions: Question[]
  assets: Asset[]
}

export default function StudyPage({ prep, questions, assets }: Props) {
  const { searchParams, set: setUrlParams } = useUrlParams()

  const tab = parseStudyTab(searchParams.get("tab"))
  const [ activeAttempt, setActiveAttempt ] = useState<"quiz" | "test" | null>(null)
  const { data: session } = useSession()
  const userId = session?.user.id ?? null

  function setTab(next: StudyTab) {
    setUrlParams({ tab: next })
  }

  const flashcards = questions.filter(q => q.type === "flashcard").map(q => q.content as unknown as FlashcardContent)
  const studyQuestions = questions.filter(q => q.type !== "flashcard")

  if (activeAttempt) {
    return (
      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex items-center justify-between">
          <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => setActiveAttempt(null)}>
            ← Back to Study
          </Button>
          {!userId && (
            <span className="text-sm text-muted-foreground">Sign in to save your results</span>
          )}
        </div>
        <AttemptFlow
          questions={studyQuestions}
          assets={assets}
          mode={activeAttempt}
          prepId={prep.id}
          userId={userId}
          onExit={() => setActiveAttempt(null)}
        />
      </main>
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-highlight text-2xl font-bold tracking-tight">{prep.title}</h1>
        {prep.description && (
          <p className="text-sm text-muted-foreground">{prep.description}</p>
        )}
      </div>

      {questions.length === 0 ? (
        <p className="px-8 py-8 text-center text-sm text-muted-foreground">No questions available yet.</p>
      ) : (
        <StudyTabs
          tab={tab}
          onTabChange={setTab}
          flashcards={flashcards}
          studyQuestions={studyQuestions}
          onStartAttempt={setActiveAttempt}
        />
      )}
    </main>
  )
}
