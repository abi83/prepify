import type { Question, Asset } from '@prisma/client'
import type { SingleChoiceContent, MultipleChoiceContent, FillTheGapContent, SortingContent } from '../../types/questions'
import SingleChoiceQuestion from './SingleChoiceQuestion'
import MultipleChoiceQuestion from './MultipleChoiceQuestion'
import FillTheGapQuestion from './FillTheGapQuestion'
import SortingQuestion from './SortingQuestion'
import AssetFrame from './AssetFrame'

export interface AnswerState {
  single: string | null
  multi: string[]
  fill: string[]
  sort: string[]
}

export function emptyAnswer(): AnswerState {
  return { single: null, multi: [], fill: [], sort: [] }
}

interface Props {
  question: Question
  answer: AnswerState
  isReview: boolean
  asset?: Asset
  onChange?: (next: AnswerState) => void
}

export default function QuestionBody({ question, answer, isReview, asset, onChange }: Props) {
  const assetEl = asset ? <AssetFrame blob={asset.blob} /> : null

  switch (question.type) {
    case 'flashcard':
      // Flashcards don't render in the attempt flow — handled separately in Cards tab
      return null

    case 'single_choice':
      return (
        <>
          {assetEl}
          <SingleChoiceQuestion
            content={question.content as unknown as SingleChoiceContent}
            selected={answer.single}
            isReview={isReview}
            onChange={id => onChange?.({ ...answer, single: id })}
          />
        </>
      )

    case 'multiple_choice':
      return (
        <>
          {assetEl}
          <MultipleChoiceQuestion
            content={question.content as unknown as MultipleChoiceContent}
            selected={answer.multi}
            isReview={isReview}
            onChange={ids => onChange?.({ ...answer, multi: ids })}
          />
        </>
      )

    case 'fill_the_gap':
      return (
        <>
          {assetEl}
          <FillTheGapQuestion
            content={question.content as unknown as FillTheGapContent}
            selected={answer.fill}
            isReview={isReview}
            onChange={(fills) => onChange?.({ ...answer, fill: fills })}
          />
        </>
      )

    case 'sorting':
      return (
        <>
          {assetEl}
          <SortingQuestion
            content={question.content as unknown as SortingContent}
            selected={answer.sort}
            isReview={isReview}
            onChange={(order) => onChange?.({ ...answer, sort: order })}
          />
        </>
      )

    default:
      return null
  }
}
