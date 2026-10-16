import type { Question, Asset } from "@prisma/client"

import { isStudyTab, type StudyTab } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

import PracticeFlow from "./attempt/PracticeFlow"
import FlashCard from "./questions/FlashCard"
import { Button } from "./ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"

interface Props {
  tab: StudyTab
  onTabChange: (tab: StudyTab) => void
  flashcards: FlashcardContent[]
  studyQuestions: Question[]
  assets: Asset[]
  onStartAttempt: () => void
}

export default function StudyTabs({ tab, onTabChange, flashcards, studyQuestions, assets, onStartAttempt }: Props) {
  return (
    <Tabs
      value={tab}
      onValueChange={v => {
        if (!isStudyTab(v)) throw new Error(`Unexpected tab value from Tabs: ${v}`)
        onTabChange(v)
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>
        <Button onClick={onStartAttempt} disabled={studyQuestions.length === 0}>
          Start attempt
        </Button>
      </div>

      <TabsContent value="flashcards">
        {flashcards.length > 0 ? (
          <FlashCard cards={flashcards} />
        ) : (
          <p className="px-8 py-8 text-center text-sm text-muted-foreground">No flashcards in this set.</p>
        )}
      </TabsContent>

      <TabsContent value="questions">
        <PracticeFlow questions={studyQuestions} assets={assets} />
      </TabsContent>
    </Tabs>
  )
}
