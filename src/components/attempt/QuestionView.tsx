import type { Question, Asset } from "@prisma/client"

import QuestionBody, { type AnswerState } from "@/components/questions/QuestionBody"

interface Props {
  question: Question
  answer: AnswerState
  isReview: boolean
  asset?: Asset
  onChange: (next: AnswerState) => void
}

export default function QuestionView({ question, answer, isReview, asset, onChange }: Props) {
  return (
    <>
      <p className="mb-5 text-lg font-medium leading-relaxed">{
        (question.content as unknown as { question?: string }).question ?? ""
      }</p>
      <div className="flex-1">
        <QuestionBody question={question} answer={answer} isReview={isReview} asset={asset} onChange={onChange} />
      </div>
    </>
  )
}
