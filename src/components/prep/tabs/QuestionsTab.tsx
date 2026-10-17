import type { Asset, Question } from "@prisma/client"

import PracticeFlow from "@/components/attempt/PracticeFlow"
import GenerationCost from "@/components/GenerationCost"
import type { JobGeneration } from "@/repositories/prepStateRepository"

interface Props {
  studyQuestions: Question[]
  assets: Asset[]
  generationOfQuestion: (question: Question) => JobGeneration | null
}

export default function QuestionsTab({ studyQuestions, assets, generationOfQuestion }: Props) {
  return (
    <PracticeFlow
      questions={studyQuestions}
      assets={assets}
      questionFooter={question => {
        const generation = generationOfQuestion(question)
        return generation && <div className="mt-3"><GenerationCost generation={generation} /></div>
      }}
    />
  )
}
