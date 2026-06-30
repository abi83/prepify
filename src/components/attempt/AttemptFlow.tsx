import { useState } from 'react'
import type { Question, SingleChoiceContent, MultipleChoiceContent, FillTheGapContent, SortingContent, Asset } from '../../types/questions'
import QuestionBody, { AnswerState, emptyAnswer } from '../questions/QuestionBody'
import ScoreScreen from './ScoreScreen'
import { supabase } from '../../lib/supabase'
import { isAnswerCorrect } from '../../lib/scoring'
import styles from './AttemptFlow.module.css'

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
      const c = q.content as SingleChoiceContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    case 'multiple_choice': {
      const c = q.content as MultipleChoiceContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    case 'fill_the_gap': {
      const c = q.content as FillTheGapContent
      return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
    }
    case 'sorting': {
      const c = q.content as SortingContent
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
      const c = q.content as MultipleChoiceContent
      const correctCount = c.answers.filter(x => x.is_correct).length
      return a.multi.length === correctCount
    }
    case 'fill_the_gap': {
      const { gaps } = q.content as { gaps: { index: number }[] }
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
  const assetByQuestion = new Map(assets.map(a => [a.question_id, a]))
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
      await supabase.from('attempts').insert({ prep_id: prepId, user_id: userId, mode, score, total })
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
    <div className={styles.root}>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${((index) / total) * 100}%` }} />
      </div>

      <div className={styles.header}>
        <span className={styles.counter}>Question {index + 1} of {total}</span>
        <span className={styles.modeBadge}>{mode}</span>
      </div>

      <p className={styles.questionText}>{
        (current.content as { question?: string }).question ?? ''
      }</p>

      <div className={styles.body}>
        <QuestionBody
          question={current}
          answer={currentAnswer}
          isReview={isReview}
          asset={assetByQuestion.get(current.id)}
          onChange={handleAnswerChange}
        />
      </div>

      {feedbackShown && (
        <div className={`${styles.feedback} ${wasCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect}`}>
          {wasCorrect ? '✓ Correct!' : '✗ Incorrect'}
        </div>
      )}

      <div className={styles.controls}>
        <button className={styles.prevBtn} onClick={handlePrev} disabled={index === 0}>
          ← Back
        </button>

        {/* Quiz mode: show Submit answer → then Next */}
        {mode === 'quiz' && !submitted[index] && (
          <button
            className={styles.nextBtn}
            onClick={handleQuizSubmit}
            disabled={!isAnswerValid(current, currentAnswer)}
          >
            Submit answer
          </button>
        )}

        {mode === 'quiz' && submitted[index] && !isLastQuestion && (
          <button className={styles.nextBtn} onClick={handleNext}>
            Next →
          </button>
        )}

        {mode === 'quiz' && submitted[index] && isLastQuestion && (
          <button className={styles.submitBtn} onClick={() => setShowConfirm(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Finish'}
          </button>
        )}

        {/* Test mode: next / finish at end */}
        {mode === 'test' && !isLastQuestion && (
          <button
            className={styles.nextBtn}
            onClick={handleNext}
            disabled={!isAnswerValid(current, currentAnswer)}
          >
            Next →
          </button>
        )}

        {mode === 'test' && isLastQuestion && (
          <button
            className={styles.submitBtn}
            onClick={() => setShowConfirm(true)}
            disabled={!isAnswerValid(current, currentAnswer) || saving}
          >
            {saving ? 'Saving…' : 'Submit test'}
          </button>
        )}
      </div>

      {showConfirm && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Submit {mode}?</h3>
            <p>
              {mode === 'quiz'
                ? userId
                  ? 'Your results will be saved to your history.'
                  : 'Sign in to save results to your history.'
                : `You've answered all ${total} questions. Submit for your final score?`}
            </p>
            <div className={styles.dialogBtns}>
              <button className={styles.cancelBtn} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className={styles.confirmBtn} onClick={finalize} disabled={saving}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
