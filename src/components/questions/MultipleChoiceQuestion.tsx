import type { MultipleChoiceContent } from '../../types/questions'
import styles from './ChoiceQuestion.module.css'

interface Props {
  content: MultipleChoiceContent
  selected: string[]
  isReview: boolean
  onChange?: (ids: string[]) => void
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function MultipleChoiceQuestion({ content, selected, isReview, onChange }: Props) {
  const correctCount = content.answers.filter(a => a.is_correct).length

  function toggle(id: string) {
    if (isReview || !onChange) return
    const next = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id]
    onChange(next)
  }

  return (
    <div className={styles.root}>
      <span className={styles.hint}>Select {correctCount} answers</span>
      {content.answers.map((answer, i) => {
        const isSelected = selected.includes(answer.id)
        const isCorrect = isReview && answer.is_correct
        const isWrong = isReview && isSelected && !answer.is_correct

        let cls = styles.option
        if (isCorrect) cls += ` ${styles.correct}`
        else if (isWrong) cls += ` ${styles.incorrect}`
        else if (isSelected) cls += ` ${styles.selected}`
        if (isReview) cls += ` ${styles.disabled}`

        return (
          <button
            key={answer.id}
            className={cls}
            onClick={() => toggle(answer.id)}
            disabled={isReview}
          >
            <span className={styles.badge}>{LABELS[i]}</span>
            <span className={styles.optionBody}>
              <span className={styles.optionText}>{answer.text}</span>
              {isReview && (isCorrect || isWrong) && (
                <span className={`${styles.explanation} ${isCorrect ? styles.correct : styles.incorrect}`}>
                  {answer.explanation}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
