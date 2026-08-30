import { useState } from 'react'
import type { Question, Asset } from '@prisma/client'
import type { SingleChoiceContent, MultipleChoiceContent, FillTheGapContent, SortingContent } from '../../types/questions'
import { cn } from '@/lib/utils'
import QuestionBody, { AnswerState, emptyAnswer } from '../questions/QuestionBody'
import ScoreScreen from './ScoreScreen'
import { insertAttempt } from '../../actions/attempts'
import { isAnswerCorrect } from '../../lib/scoring'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function shuffleQuestionAnswers(q: Question): Question {
  switch (q.type) {
    case 'single_choice': {
      const c = q.content as unknown as SingleChoiceContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    case 'multiple_choice': {
      const c = q.content as unknown as MultipleChoiceContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    case 'fill_the_gap': {
      const c = q.content as unknown as FillTheGapContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    case 'sorting': {
      const c = q.content as unknown as SortingContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    default:
      return q
  }
}

interface Props {
  questions: Question[]
  assets: Asset[]
  mode: 'quiz' | 'test'
  prepId: string
  userId: string | null
  onExit: () => void
}

type Phase = 'attempt' | 'score'

export function isAnswerValid(q: Question, a: AnswerState): boolean {
  switch (q.type) {
    case 'single_choice': return a.single !== null
    case 'multiple_choice': {
      const c = q.content as unknown as MultipleChoiceContent
      const correctCount = c.answers.filter(x => x.is_correct).length
      return a.multi.length === correctCount
    }
    case 'fill_the_gap': {
      const { gaps } = q.content as unknown as { gaps: { index: number }[] }
      return gaps.every(g => !!a.fill[g.index - 1])
    }
    case 'sorting': return a.sort.length > 0
    default: return false
  }
}

// Filter out flashcards — they're shown in the Cards tab, not in quiz/test
function getAttemptQuestions(questions: Question[]): Question[] {
  return questions.filter(q => q.type !== 'flashcard')
}

export default function AttemptFlow({ questions, assets, mode, prepId, userId, onExit }: Props) {
  const assetByQuestion = new Map(assets.map(a => [a.questionId, a]))
  const attemptQuestions = getAttemptQuestions(questions)
  const total = attemptQuestions.length

  const [phase, setPhase] = useState<Phase>('attempt')
  const [index, setIndex] = useState(0)
  const [shuffledQuestions] = useState<Question[]>(() => attemptQuestions.map(shuffleQuestionAnswers))
  const [answers, setAnswers] = useState<AnswerState[]>(() => attemptQuestions.map(() => emptyAnswer()))
  const [submitted, setSubmitted] = useState<boolean[]>(() => attemptQuestions.map(() => false))
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)

  const current = shuffledQuestions[index]
  const currentAnswer = answers[index]
  const isLastQuestion = index === total - 1

  // In quiz mode, a question is "reviewed" once the user submits it
  const isReview = mode === 'quiz' ? submitted[index] : phase === 'score'

  const feedbackShown = mode === 'quiz' && submitted[index]
  const wasCorrect = feedbackShown ? isAnswerCorrect(current, currentAnswer) : false

  function handleAnswerChange(next: AnswerState) {
    setAnswers(prev => prev.map((a, i) => i === index ? next : a))
  }

  function handleQuizSubmit() {
    setSubmitted(prev => prev.map((s, i) => i === index ? true : s))
  }

  function handleNext() {
    if (index < total - 1) setIndex(i => i + 1)
  }

  function handlePrev() {
    if (index > 0) setIndex(i => i - 1)
  }

  async function finalize() {
    setSaving(true)
    const score = attemptQuestions.reduce((acc, q, i) => acc + (isAnswerCorrect(q, answers[i]) ? 1 : 0), 0)
    if (userId) {
      await insertAttempt(prepId, mode, score, total)
    }
    setSaving(false)
    setPhase('score')
    setShowConfirm(false)
  }

  if (phase === 'score') {
    const score = attemptQuestions.reduce((acc, q, i) => acc + (isAnswerCorrect(q, answers[i]) ? 1 : 0), 0)
    return (
      <ScoreScreen
        score={score}
        total={total}
        mode={mode}
        questions={shuffledQuestions}
        answers={answers}
        assets={assets}
        onExit={onExit}
      />
    )
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6 h-1 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${((index) / total) * 100}%` }} />
      </div>

      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Question {index + 1} of {total}</span>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{mode}</span>
      </div>

      <p className="mb-5 text-lg font-medium leading-relaxed">{
        (current.content as unknown as { question?: string }).question ?? ''
      }</p>

      <div className="flex-1">
        <QuestionBody
          question={current}
          answer={currentAnswer}
          isReview={isReview}
          asset={assetByQuestion.get(current.id)}
          onChange={handleAnswerChange}
        />
      </div>

      {feedbackShown && (
        <div
          className={cn(
            'mt-4 rounded-sm px-4 py-3 text-sm font-semibold',
            wasCorrect ? 'border border-success bg-success/10 text-success' : 'border border-error bg-error/10 text-error',
          )}
        >
          {wasCorrect ? '✓ Correct!' : '✗ Incorrect'}
        </div>
      )}

      <div className="mt-7 flex gap-2.5 border-t border-border pt-5">
        <Button variant="outline" onClick={handlePrev} disabled={index === 0}>
          ← Back
        </Button>

        {/* Quiz mode: show Submit answer → then Next */}
        {mode === 'quiz' && !submitted[index] && (
          <Button
            className="flex-1"
            onClick={handleQuizSubmit}
            disabled={!isAnswerValid(current, currentAnswer)}
          >
            Submit answer
          </Button>
        )}

        {mode === 'quiz' && submitted[index] && !isLastQuestion && (
          <Button className="flex-1" onClick={handleNext}>
            Next →
          </Button>
        )}

        {mode === 'quiz' && submitted[index] && isLastQuestion && (
          <Button className="flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={() => setShowConfirm(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Finish'}
          </Button>
        )}

        {/* Test mode: next / finish at end */}
        {mode === 'test' && !isLastQuestion && (
          <Button
            className="flex-1"
            onClick={handleNext}
            disabled={!isAnswerValid(current, currentAnswer)}
          >
            Next →
          </Button>
        )}

        {mode === 'test' && isLastQuestion && (
          <Button
            className="flex-1 bg-success text-success-foreground hover:bg-success/90"
            onClick={() => setShowConfirm(true)}
            disabled={!isAnswerValid(current, currentAnswer) || saving}
          >
            {saving ? 'Saving…' : 'Submit test'}
          </Button>
        )}
      </div>

      <Dialog open={showConfirm} onOpenChange={open => !open && setShowConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit {mode}?</DialogTitle>
            <DialogDescription>
              {mode === 'quiz'
                ? userId
                  ? 'Your results will be saved to your history.'
                  : 'Sign in to save results to your history.'
                : `You've answered all ${total} questions. Submit for your final score?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={finalize} disabled={saving}>
              {saving ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
