import type { MultipleChoiceContent } from '../../types/questions'
import { badgeClassName, explanationClassName, optionClassName } from './optionStyles'

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
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else if (selected.length < correctCount) {
      onChange([...selected, id])
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="px-0 py-1 text-xs text-muted-foreground">Select {correctCount} answers</span>
      {content.answers.map((answer, i) => {
        const isSelected = selected.includes(answer.id)
        const isCorrect = isReview && answer.is_correct
        const isWrong = isReview && isSelected && !answer.is_correct

        return (
          <button
            key={answer.id}
            className={optionClassName({ selected: isSelected, correct: isCorrect, incorrect: isWrong, disabled: isReview })}
            onClick={() => toggle(answer.id)}
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
