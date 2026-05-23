import type { SingleChoiceContent } from '../../types/questions'
import styles from './ChoiceQuestion.module.css'

interface Props {
  content: SingleChoiceContent
  selected: string | null
  isReview: boolean
  onChange?: (id: string) => void
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function SingleChoiceQuestion({ content, selected, isReview, onChange }: Props) {
  return (
    <div className={styles.root}>
      {content.answers.map((answer, i) => {
        const isSelected = selected === answer.id
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
            onClick={() => !isReview && onChange?.(answer.id)}
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
