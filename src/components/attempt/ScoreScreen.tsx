import type { Question, Asset } from '@prisma/client'
import type { AnswerState } from '../questions/QuestionBody'
import QuestionBody from '../questions/QuestionBody'
import { isAnswerCorrect } from '../../lib/scoring'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'

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
  const assetByQuestion = new Map(assets.map(a => [a.questionId, a]))
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const isGood = pct >= 60

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-8 text-center">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {mode === 'quiz' ? 'Quiz' : 'Test'} complete
        </span>
        <span className={cn('text-5xl leading-none font-extrabold', isGood ? 'text-success' : 'text-error')}>
          {pct}%
        </span>
        <span className="text-base text-muted-foreground">{score} / {total} correct</span>
      </div>

      {mode === 'test' && (
        <div>
          <h3 className="mb-3.5 text-sm font-bold tracking-wide text-muted-foreground uppercase">Review</h3>
          <div className="flex flex-col gap-4">
            {questions.map((q, i) => {
              const answer = answers[i]
              const correct = isAnswerCorrect(q, answer)
              return (
                <div
                  key={q.id}
                  className={cn(
                    'flex flex-col gap-2.5 rounded-sm border border-border bg-background p-4',
                    correct ? 'border-success' : 'border-error',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-bold',
                        correct ? 'bg-success/15 text-success' : 'bg-error/15 text-error',
                      )}
                    >
                      {correct ? '✓' : '✗'}
                    </span>
                    <span className="flex-1 text-sm leading-tight font-medium">
                      {(q.content as unknown as { question?: string }).question ?? ''}
                    </span>
                  </div>
                  <QuestionBody question={q} answer={answer} isReview={true} asset={assetByQuestion.get(q.id)} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        <Button variant="outline" className="flex-1" onClick={onExit}>← Back to Prep</Button>
      </div>
    </div>
  )
}
