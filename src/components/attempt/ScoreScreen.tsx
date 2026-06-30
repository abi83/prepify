import type { Question, Asset } from '../../types/questions'
import type { AnswerState } from '../questions/QuestionBody'
import QuestionBody from '../questions/QuestionBody'
import { isAnswerCorrect } from '../../lib/scoring'
import styles from './ScoreScreen.module.css'

interface Props {
  score: number
  total: number
  mode: 'quiz' | 'test'
  questions: Question[]
  answers: AnswerState[]
  assets: Asset[]
  onExit: () => void
}

export default function ScoreScreen({ score, total, mode, questions, answers, assets, onExit }: Props) {
  const assetByQuestion = new Map(assets.map(a => [a.question_id, a]))
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
                  <QuestionBody question={q} answer={answer} isReview={true} asset={assetByQuestion.get(q.id)} />
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
