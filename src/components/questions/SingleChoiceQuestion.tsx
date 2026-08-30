import type { SingleChoiceContent } from '../../types/questions'
import { badgeClassName, explanationClassName, optionClassName } from './optionStyles'

interface Props {
  content: SingleChoiceContent
  selected: string | null
  isReview: boolean
  onChange?: (id: string) => void
}

const LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function SingleChoiceQuestion({ content, selected, isReview, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      {content.answers.map((answer, i) => {
        const isSelected = selected === answer.id
        const isCorrect = isReview && answer.is_correct
        const isWrong = isReview && isSelected && !answer.is_correct

        return (
          <button
            key={answer.id}
            className={optionClassName({ selected: isSelected, correct: isCorrect, incorrect: isWrong, disabled: isReview })}
            onClick={() => !isReview && onChange?.(answer.id)}
            disabled={isReview}
          >
            <span className={badgeClassName({ selected: isSelected, correct: isCorrect, incorrect: isWrong })}>
              {LABELS[i]}
            </span>
            <span className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm leading-relaxed">{answer.text}</span>
              {isReview && (isCorrect || isWrong) && (
                <span className={explanationClassName(isCorrect)}>{answer.explanation}</span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
