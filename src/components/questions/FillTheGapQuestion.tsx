import type { FillTheGapContent } from '../../types/questions'
import styles from './FillTheGapQuestion.module.css'

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
    const currentValue = isReview
      ? (selected[gapIndex] || '')
      : (selected[gapIndex] || '')

    let cls = styles.gapSelect
    if (isReview && gap) {
      const isCorrect = currentValue === gap.correct_answer_id
      cls += isCorrect ? ` ${styles.correct}` : ` ${styles.incorrect}`

      if (gap.explanation) {
        const correctLabel = content.answers.find(a => a.id === gap.correct_answer_id)?.label ?? ''
        reviewExplanations.push({ gapIndex, correct: isCorrect, explanation: gap.explanation, correctLabel })
      }
    }

    return (
      <select
        key={i}
        className={cls}
        value={currentValue}
        onChange={e => handleChange(gapIndex, e.target.value)}
        disabled={isReview}
      >
        <option value="" disabled>___</option>
        {content.answers.map(opt => {
          const disabledByUsage = !isReview && !opt.multiple_usage && usedOnce.has(opt.id) && selected[gapIndex] !== opt.id
          return (
            <option key={opt.id} value={opt.id} disabled={disabledByUsage}>
              {opt.label}
            </option>
          )
        })}
      </select>
    )
  })

  return (
    <div className={styles.root}>
      <span className={styles.hint}>
        Fill {gaps.length} gap{gaps.length !== 1 ? 's' : ''} — select from the dropdowns
      </span>
      <p className={styles.sentence}>{rendered}</p>
      {isReview && reviewExplanations.map(({ gapIndex, correct, explanation, correctLabel }) => (
        <div key={gapIndex} className={`${styles.explanation} ${correct ? styles.explanationCorrect : styles.explanationIncorrect}`}>
          {!correct && correctLabel && <strong>Correct: {correctLabel}. </strong>}
          {explanation}
        </div>
      ))}
    </div>
  )
}
