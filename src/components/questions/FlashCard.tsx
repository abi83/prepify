import { useState } from 'react'
import type { FlashcardContent } from '../../types/questions'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'

interface Props {
  cards: FlashcardContent[]
}

export default function FlashCard({ cards }: Props) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const card = cards[index]
  const total = cards.length

  function goTo(next: number) {
    setIndex(next)
    setFlipped(false)
  }

  if (!card) return null

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <span className="text-sm text-muted-foreground">Card {index + 1} of {total}</span>

      <div
        className="w-full max-w-[560px] cursor-pointer [perspective:1000px]"
        style={{ aspectRatio: '3 / 2' }}
        onClick={() => setFlipped(f => !f)}
      >
        <div
          className={cn(
            'relative h-full w-full transition-transform duration-500 ease-in-out [transform-style:preserve-3d]',
            flipped && '[transform:rotateY(180deg)]',
          )}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-background p-8 text-center [backface-visibility:hidden]">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Question</span>
            <p className="text-lg font-medium leading-relaxed">{card.front}</p>
            <span className="mt-auto text-xs text-muted-foreground">Click to reveal answer</span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted p-8 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Answer</span>
            <p className="text-xl font-bold">{card.back}</p>
            {card.back_explanation && (
              <p className="text-sm leading-relaxed text-muted-foreground">{card.back_explanation}</p>
            )}
            <span className="mt-auto text-xs text-muted-foreground">Click to flip back</span>
          </div>
        </div>
      </div>

      <div className="flex w-full max-w-[560px] gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => goTo((index - 1 + total) % total)}
          disabled={total <= 1}
        >
          ← Prev
        </Button>
        <Button
          className="flex-1"
          onClick={() => goTo((index + 1) % total)}
          disabled={total <= 1}
        >
          Next →
        </Button>
      </div>
    </div>
  )
}
