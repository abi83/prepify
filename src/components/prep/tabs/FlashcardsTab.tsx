import FlashCard from "@/components/questions/FlashCard"
import type { FlashcardContent } from "@/types/questions"

interface Props {
  flashcards: FlashcardContent[]
}

export default function FlashcardsTab({ flashcards }: Props) {
  if (flashcards.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No flashcards in this prep.</p>
  return <FlashCard cards={flashcards} />
}
