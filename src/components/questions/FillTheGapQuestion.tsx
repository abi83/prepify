import type { FillTheGapContent } from '../../types/questions'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

interface Props {
  content: FillTheGapContent
  // selectedAnswer[i] = answer id chosen for gap at index i (0-based)
  selected: string[]
  isReview: boolean
  onChange?: (answers: string[], isValid: boolean) => void
}

export default function FillTheGapQuestion({ content, selected, isReview, onChange }: Props) {
  const { gaps } = content

  const usedOnce = new Set<string>()
  selected.forEach(id => {
    const opt = content.answers.find(a => a.id === id)
    if (opt && !opt.multiple_usage) usedOnce.add(id)
  })

  function handleChange(gapIndex: number, answerId: string) {
    if (isReview || !onChange) return
    const next = [...selected]
    next[gapIndex] = answerId
    const valid = gaps.every((_, i) => !!next[i])
    onChange(next, valid)
  }

  const parts = content.question.split(/(\{\{gap:\d+\}\})/g)

  const reviewExplanations: { gapIndex: number; correct: boolean; explanation: string; correctLabel: string }[] = []

  const rendered = parts.map((part, i) => {
    const match = part.match(/\{\{gap:(\d+)\}\}/)
    if (!match) return <span key={i}>{part}</span>

    const gapNumber = parseInt(match[1])
    const gapIndex = gapNumber - 1
    const gap = gaps.find(g => g.index === gapNumber)
    const currentValue = selected[gapIndex] || ''

    let isCorrect = false
    if (isReview && gap) {
      isCorrect = currentValue === gap.correct_answer_id

      if (gap.explanation) {
        const correctLabel = content.answers.find(a => a.id === gap.correct_answer_id)?.label ?? ''
        reviewExplanations.push({ gapIndex, correct: isCorrect, explanation: gap.explanation, correctLabel })
      }
    }

    return (
      <Select
        key={i}
        value={currentValue}
        onValueChange={v => handleChange(gapIndex, v)}
        disabled={isReview}
      >
        <SelectTrigger
          size="sm"
          className={cn(
            'mx-1 inline-flex min-w-[130px] align-middle',
            isReview && (isCorrect ? 'border-success bg-success/10' : 'border-error bg-error/10'),
          )}
        >
          <SelectValue placeholder="___" />
        </SelectTrigger>
        <SelectContent>
          {content.answers.map(opt => {
            const disabledByUsage = !isReview && !opt.multiple_usage && usedOnce.has(opt.id) && selected[gapIndex] !== opt.id
            return (
              <SelectItem key={opt.id} value={opt.id} disabled={disabledByUsage}>
                {opt.label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    )
  })

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs text-muted-foreground">
        Fill {gaps.length} gap{gaps.length !== 1 ? 's' : ''} — select from the dropdowns
      </span>
      <p className="text-base leading-[2.6]">{rendered}</p>
      {isReview && reviewExplanations.map(({ gapIndex, correct, explanation, correctLabel }) => (
        <div
          key={gapIndex}
          className={cn(
            'rounded-sm border-l-[3px] bg-muted px-3 py-2 text-sm text-muted-foreground',
            correct ? 'border-l-success text-success' : 'border-l-error',
          )}
        >
          {!correct && correctLabel && <strong>Correct: {correctLabel}. </strong>}
          {explanation}
        </div>
      ))}
    </div>
  )
}
