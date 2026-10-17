import type { Question, Asset } from "@prisma/client"

import DifficultyBadge from "@/components/DifficultyBadge"
import QuestionBody from "@/components/questions/QuestionBody"
import type { AnswerState } from "@/types/questions"

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
      <div className="mb-2 flex"><DifficultyBadge difficulty={question.difficulty} /></div>
      <p className="mb-5 text-lg font-medium leading-relaxed">{
        (question.content as unknown as { question?: string }).question ?? ""
      }</p>
      <div className="flex-1">
        <QuestionBody question={question} answer={answer} isReview={isReview} asset={asset} onChange={onChange} />
      </div>
    </>
  )
}
