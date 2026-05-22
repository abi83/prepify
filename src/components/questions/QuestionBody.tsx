import type { Question, SingleChoiceContent, MultipleChoiceContent, FillTheGapContent, SortingContent } from '../../types/questions'
import SingleChoiceQuestion from './SingleChoiceQuestion'
import MultipleChoiceQuestion from './MultipleChoiceQuestion'
import FillTheGapQuestion from './FillTheGapQuestion'
import SortingQuestion from './SortingQuestion'

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
  onChange?: (next: AnswerState) => void
}

export default function QuestionBody({ question, answer, isReview, onChange }: Props) {
  switch (question.type) {
    case 'flashcard':
      // Flashcards don't render in the attempt flow — handled separately in Cards tab
      return null

    case 'single_choice':
      return (
        <SingleChoiceQuestion
          content={question.content as SingleChoiceContent}
          selected={answer.single}
          isReview={isReview}
          onChange={id => onChange?.({ ...answer, single: id })}
        />
      )

    case 'multiple_choice':
      return (
        <MultipleChoiceQuestion
          content={question.content as MultipleChoiceContent}
          selected={answer.multi}
          isReview={isReview}
          onChange={ids => onChange?.({ ...answer, multi: ids })}
        />
      )

    case 'fill_the_gap':
      return (
        <FillTheGapQuestion
          content={question.content as FillTheGapContent}
          selected={answer.fill}
          isReview={isReview}
          onChange={(fills) => onChange?.({ ...answer, fill: fills })}
        />
      )

    case 'sorting':
      return (
        <SortingQuestion
          content={question.content as SortingContent}
          selected={answer.sort}
          isReview={isReview}
          onChange={(order) => onChange?.({ ...answer, sort: order })}
        />
      )

    default:
      return null
  }
}
