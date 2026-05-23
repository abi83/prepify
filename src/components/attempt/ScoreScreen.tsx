import type { Question } from '../../types/questions'
import type { AnswerState } from '../questions/QuestionBody'
import QuestionBody from '../questions/QuestionBody'
import styles from './ScoreScreen.module.css'

interface Props {
  score: number
  total: number
  mode: 'quiz' | 'test'
  questions: Question[]
  answers: AnswerState[]
  onExit: () => void
}

export default function ScoreScreen({ score, total, mode, questions, answers, onExit }: Props) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const isGood = pct >= 60

  return (
    <div className={styles.root}>
      <div className={styles.hero}>
        <span className={styles.scoreLabel}>
          {mode === 'quiz' ? 'Quiz' : 'Test'} complete
        </span>
        <span className={`${styles.scoreValue} ${isGood ? styles.good : styles.bad}`}>
          {pct}%
        </span>
        <span className={styles.fraction}>{score} / {total} correct</span>
      </div>

      {mode === 'test' && (
        <div className={styles.reviewSection}>
          <h3>Review</h3>
          <div className={styles.reviewList}>
            {questions.map((q, i) => {
              const answer = answers[i]
              const correct = isAnswerCorrect(q, answer)
              return (
                <div key={q.id} className={`${styles.reviewItem} ${correct ? styles.correct : styles.incorrect}`}>
                  <div className={styles.reviewItemHeader}>
                    <span className={`${styles.reviewResult} ${correct ? styles.correct : styles.incorrect}`}>
                      {correct ? '✓' : '✗'}
                    </span>
                    <span className={styles.reviewQuestion}>
                      {(q.content as { question?: string }).question ?? ''}
                    </span>
                  </div>
                  <QuestionBody question={q} answer={answer} isReview={true} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.controls}>
        <button className={styles.exitBtn} onClick={onExit}>← Back to Prep</button>
      </div>
    </div>
  )
}

function isAnswerCorrect(q: Question, a: AnswerState): boolean {
  switch (q.type) {
    case 'single_choice': {
      const c = (q.content as { answers: { id: string; is_correct: boolean }[] }).answers
      return c.find(x => x.id === a.single)?.is_correct ?? false
    }
    case 'multiple_choice': {
      const c = (q.content as { answers: { id: string; is_correct: boolean }[] }).answers
      const correct = new Set(c.filter(x => x.is_correct).map(x => x.id))
      const given = new Set(a.multi)
      return correct.size === given.size && [...correct].every(id => given.has(id))
    }
    case 'fill_the_gap': {
      const { gaps } = q.content as { gaps: { index: number; correct_answer_id: string }[] }
      return gaps.every((g, i) => a.fill[i] === g.correct_answer_id)
    }
    case 'sorting': {
      const { answers } = q.content as { answers: { id: string; correct_index: number }[] }
      return answers.every(ans => a.sort.indexOf(ans.id) + 1 === ans.correct_index)
    }
    default: return false
  }
}
