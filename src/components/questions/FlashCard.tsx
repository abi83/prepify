import { useState } from 'react'
import type { FlashcardContent } from '../../types/questions'
import styles from './FlashCard.module.css'

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
    <div className={styles.wrapper}>
      <span className={styles.counter}>Card {index + 1} of {total}</span>

      <div className={styles.scene} onClick={() => setFlipped(f => !f)}>
        <div className={`${styles.card} ${flipped ? styles.flipped : ''}`}>
          <div className={`${styles.face} ${styles.front}`}>
            <span className={styles.faceLabel}>Question</span>
            <p className={styles.question}>{card.front}</p>
            <span className={styles.hint}>Click to reveal answer</span>
          </div>
          <div className={`${styles.face} ${styles.back}`}>
            <span className={styles.faceLabel}>Answer</span>
            <p className={styles.answer}>{card.back}</p>
            {card.back_explanation && (
              <p className={styles.explanation}>{card.back_explanation}</p>
            )}
            <span className={styles.hint}>Click to flip back</span>
          </div>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          className={styles.navBtn}
          onClick={() => goTo((index - 1 + total) % total)}
          disabled={total <= 1}
        >
          ← Prev
        </button>
        <button
          className={`${styles.navBtn} ${styles.next}`}
          onClick={() => goTo((index + 1) % total)}
          disabled={total <= 1}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
