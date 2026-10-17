import type { Question, Asset } from "@prisma/client"
import { useState, type ReactNode } from "react"

import { emptyAnswer } from "@/components/questions/QuestionBody"
import { Button } from "@/components/ui/button"
import { isAnswerCorrect } from "@/lib/scoring"
import { cn } from "@/lib/utils"
import type { AnswerState } from "@/types/questions"

import { isAnswerValid, prepareQuestions } from "./questionUtils"
import QuestionView from "./QuestionView"

interface Props {
  questions: Question[]
  assets: Asset[]
  /** Rendered under the current question, e.g. its generation cost. */
  questionFooter?: (question: Question) => ReactNode
}

/** Stateless practice: instant feedback after each submit, nothing persisted. */
export default function PracticeFlow({ questions, assets, questionFooter }: Props) {
  const assetByQuestion = new Map(assets.map(a => [ a.questionId, a ]))
  const [ shuffled, setShuffled ] = useState(() => prepareQuestions(questions))
  const total = shuffled.length
  const [ index, setIndex ] = useState(0)
  const [ answers, setAnswers ] = useState<AnswerState[]>(() => shuffled.map(() => emptyAnswer()))
  const [ submitted, setSubmitted ] = useState<boolean[]>(() => shuffled.map(() => false))

  if (total === 0) return <p className="px-8 py-8 text-center text-sm text-muted-foreground">No questions in this set.</p>

  const current = shuffled[index]
  const answer = answers[index]
  const isSubmitted = submitted[index]
  const isLast = index === total - 1
  const wasCorrect = isSubmitted && isAnswerCorrect(current, answer)

  function restart() {
    const next = prepareQuestions(questions)
    setShuffled(next)
    setAnswers(next.map(() => emptyAnswer()))
    setSubmitted(next.map(() => false))
    setIndex(0)
  }

  return (
    <div className="flex flex-col">
      <div className="mb-5 text-sm font-medium text-muted-foreground">Question {index + 1} of {total}</div>

      <QuestionView
        question={current}
        answer={answer}
        isReview={isSubmitted}
        asset={assetByQuestion.get(current.id)}
        onChange={next => setAnswers(prev => prev.map((a, i) => i === index ? next : a))}
      />
      {questionFooter?.(current)}

      {isSubmitted && (
        <div
          className={cn(
            "mt-4 rounded-sm px-4 py-3 text-sm font-semibold",
            wasCorrect ? "border border-success bg-success/10 text-success" : "border border-error bg-error/10 text-error",
          )}
        >
          {wasCorrect ? "✓ Correct!" : "✗ Incorrect"}
        </div>
      )}

      <div className="mt-7 flex gap-2.5 border-t border-border pt-5">
        <Button variant="outline" onClick={() => setIndex(i => i - 1)} disabled={index === 0}>← Back</Button>
        {!isSubmitted && (
          <Button
            className="flex-1"
            onClick={() => setSubmitted(prev => prev.map((s, i) => i === index ? true : s))}
            disabled={!isAnswerValid(current, answer)}
          >
            Submit answer
          </Button>
        )}
        {isSubmitted && !isLast && (
          <Button className="flex-1" onClick={() => setIndex(i => i + 1)}>Next →</Button>
        )}
        {isSubmitted && isLast && (
          <Button className="flex-1" onClick={restart}>Practice again</Button>
        )}
      </div>
    </div>
  )
}
