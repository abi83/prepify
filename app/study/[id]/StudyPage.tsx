'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import type { Prep, Question, Asset } from '@prisma/client'
import { parseStudyTab, type StudyTab } from '@/types/prep'
import { useUrlParams } from '@/lib/urlState'
import type { FlashcardContent } from '@/types/questions'
import StudyTabs from '@/components/StudyTabs'
import AttemptFlow from '@/components/attempt/AttemptFlow'
import { Button } from '@/components/ui/button'

interface Props {
  prep: Prep
  questions: Question[]
  assets: Asset[]
}

export default function StudyPage({ prep, questions, assets }: Props) {
  const { searchParams, set: setUrlParams } = useUrlParams()

  const tab = parseStudyTab(searchParams.get('tab'))
  const [activeAttempt, setActiveAttempt] = useState<'quiz' | 'test' | null>(null)
  const { data: session } = useSession()
  const userId = session?.user.id ?? null

  function setTab(next: StudyTab) {
    setUrlParams({ tab: next })
  }

  const flashcards = questions.filter(q => q.type === 'flashcard').map(q => q.content as unknown as FlashcardContent)
  const studyQuestions = questions.filter(q => q.type !== 'flashcard')

  if (activeAttempt) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => setActiveAttempt(null)}>← Back to Study</Button>
          {!userId && (
            <span className="text-sm text-muted-foreground">Sign in to save your results</span>
          )}
        </header>
        <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
          <AttemptFlow
            questions={studyQuestions}
            assets={assets}
            mode={activeAttempt}
            prepId={prep.id}
            userId={userId}
            onExit={() => setActiveAttempt(null)}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
          <Link href="/">← Home</Link>
        </Button>
        {!userId && (
          <span className="text-sm text-muted-foreground">Sign in to track your progress</span>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{prep.title}</h1>
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
    </div>
  )
}
