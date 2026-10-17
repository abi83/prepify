import GenerationCost from "@/components/GenerationCost"
import FlashCard from "@/components/questions/FlashCard"
import type { JobGeneration } from "@/repositories/prepStateRepository"
import type { FlashcardContent } from "@/types/questions"

interface Props {
  flashcards: FlashcardContent[]
  generationOfFlashcard: (index: number) => JobGeneration | null
}

export default function FlashcardsTab({ flashcards, generationOfFlashcard }: Props) {
  if (flashcards.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No flashcards in this prep.</p>
  return (
    <FlashCard
      cards={flashcards}
      footer={index => {
        const generation = generationOfFlashcard(index)
        return generation && <GenerationCost generation={generation} />
      }}
    />
  )
}
