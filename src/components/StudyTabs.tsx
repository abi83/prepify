import type { Question } from '@prisma/client'
import type { FlashcardContent } from '../types/questions'
import FlashCard from './questions/FlashCard'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

type Tab = 'cards' | 'quiz' | 'test'

interface Props {
  tab: Tab
  onTabChange: (tab: Tab) => void
  flashcards: FlashcardContent[]
  studyQuestions: Question[]
  onStartAttempt: (mode: 'quiz' | 'test') => void
}

function ModePanel({
  description,
  label,
  count,
  onStart,
}: {
  description: string
  label: string
  count: number
  onStart: () => void
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-background p-6">
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      <Button className="self-start" onClick={onStart} disabled={count === 0}>
        {label} ({count} questions)
      </Button>
    </div>
  )
}

export default function StudyTabs({ tab, onTabChange, flashcards, studyQuestions, onStartAttempt }: Props) {
  return (
    <Tabs value={tab} onValueChange={v => onTabChange(v as Tab)}>
      <TabsList>
        <TabsTrigger value="cards">Cards</TabsTrigger>
        <TabsTrigger value="quiz">Quiz</TabsTrigger>
        <TabsTrigger value="test">Test</TabsTrigger>
      </TabsList>

      <TabsContent value="cards">
        {flashcards.length > 0 ? (
          <FlashCard cards={flashcards} />
        ) : (
          <p className="px-8 py-8 text-center text-sm text-muted-foreground">No flashcards in this set.</p>
        )}
      </TabsContent>

      <TabsContent value="quiz">
        <ModePanel
          description="Answer questions one at a time — get instant feedback after each."
          label="Start Quiz"
          count={studyQuestions.length}
          onStart={() => onStartAttempt('quiz')}
        />
      </TabsContent>

      <TabsContent value="test">
        <ModePanel
          description="Answer all questions without hints — results revealed at the end."
          label="Start Test"
          count={studyQuestions.length}
          onStart={() => onStartAttempt('test')}
        />
      </TabsContent>
    </Tabs>
  )
}
