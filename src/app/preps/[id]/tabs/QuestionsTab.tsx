import PracticeFlow from "@/components/attempt/PracticeFlow"
import GenerationCost from "@/components/GenerationCost"

import type { PrepTabProps } from "./types"

export default function QuestionsTab({ studyQuestions, assets, generationOfQuestion }: PrepTabProps) {
  return (
    <PracticeFlow
      questions={studyQuestions}
      assets={assets}
      questionFooter={question => {
        const generation = generationOfQuestion(question)
        return generation && <div className="mt-3"><GenerationCost generations={[ generation ]} /></div>
      }}
    />
  )
}
