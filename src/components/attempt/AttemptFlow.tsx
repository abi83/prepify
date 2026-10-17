import type { Question, Asset } from "@prisma/client"
import { useState } from "react"

import { insertAttempt } from "@/actions/attempts"
import { emptyAnswer } from "@/components/questions/QuestionBody"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { isAnswerCorrect } from "@/lib/scoring"
import type { AnswerState } from "@/types/questions"

import { isAnswerValid, prepareQuestions } from "./questionUtils"
import QuestionView from "./QuestionView"
import ScoreScreen from "./ScoreScreen"

interface Props {
  questions: Question[]
  assets: Asset[]
  prepId: string
  userId: string | null
  onExit: () => void
}

/** Scored attempt: no hints, results revealed at the end and saved for signed-in users. */
export default function AttemptFlow({ questions, assets, prepId, userId, onExit }: Props) {
  const assetByQuestion = new Map(assets.map(a => [ a.questionId, a ]))
  const [ shuffled ] = useState(() => prepareQuestions(questions))
  const total = shuffled.length

  const [ finished, setFinished ] = useState(false)
  const [ index, setIndex ] = useState(0)
  const [ answers, setAnswers ] = useState<AnswerState[]>(() => shuffled.map(() => emptyAnswer()))
  const [ showConfirm, setShowConfirm ] = useState(false)
  const [ saving, setSaving ] = useState(false)

  const current = shuffled[index]
  const answer = answers[index]
  const isLast = index === total - 1
  const score = shuffled.reduce((acc, q, i) => acc + (isAnswerCorrect(q, answers[i]) ? 1 : 0), 0)

  async function finalize() {
    setSaving(true)
    if (userId) await insertAttempt(prepId, score, total)
    setSaving(false)
    setFinished(true)
    setShowConfirm(false)
  }

  if (finished) {
    return <ScoreScreen score={score} total={total} questions={shuffled} answers={answers} assets={assets} onExit={onExit} />
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6 h-1 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${(index / total) * 100}%` }} />
      </div>

      <div className="mb-5 text-sm font-medium text-muted-foreground">Question {index + 1} of {total}</div>

      <QuestionView
        question={current}
        answer={answer}
        isReview={false}
        asset={assetByQuestion.get(current.id)}
        onChange={next => setAnswers(prev => prev.map((a, i) => i === index ? next : a))}
      />

      <div className="mt-7 flex gap-2.5 border-t border-border pt-5">
        <Button variant="outline" onClick={() => setIndex(i => i - 1)} disabled={index === 0}>← Back</Button>
        {!isLast && (
          <Button className="flex-1" onClick={() => setIndex(i => i + 1)} disabled={!isAnswerValid(current, answer)}>
            Next →
          </Button>
        )}
        {isLast && (
          <Button
            className="flex-1 bg-success text-success-foreground hover:bg-success/90"
            onClick={() => setShowConfirm(true)}
            disabled={!isAnswerValid(current, answer) || saving}
          >
            {saving ? "Saving…" : "Submit attempt"}
          </Button>
        )}
      </div>

      <Dialog open={showConfirm} onOpenChange={open => !open && setShowConfirm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit attempt?</DialogTitle>
            <DialogDescription>
              {userId
                ? `You've answered all ${total} questions. Your result will be saved to your history.`
                : `You've answered all ${total} questions. Sign in to save results to your history.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={finalize} disabled={saving}>
              {saving ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
