import type { Question } from "@prisma/client"

import type { AnswerState } from "@/types/questions"
import type { SingleChoiceContent, MultipleChoiceContent, FillTheGapContent, SortingContent } from "@/types/questions"

function shuffleArray<T>(arr: T[]): T[] {
  const result = [ ...arr ]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ result[i], result[j] ] = [ result[j], result[i] ]
  }
  return result
}

function shuffleQuestionAnswers(q: Question): Question {
  switch (q.type) {
  case "single_choice": {
    const c = q.content as unknown as SingleChoiceContent
    return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
  }
  case "multiple_choice": {
    const c = q.content as unknown as MultipleChoiceContent
    return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
  }
  case "fill_the_gap": {
    const c = q.content as unknown as FillTheGapContent
    return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
  }
  case "sorting": {
    const c = q.content as unknown as SortingContent
    return { ...q, content: { ...c, answers: shuffleArray(c.answers) } }
  }
  default:
    return q
  }
}

/** Non-flashcard questions with shuffled answers; flashcards live in the Flashcards tab. */
export function prepareQuestions(questions: Question[]): Question[] {
  return questions.filter(q => q.type !== "flashcard").map(shuffleQuestionAnswers)
}

export function isAnswerValid(q: Question, a: AnswerState): boolean {
  switch (q.type) {
  case "single_choice": return a.single !== null
  case "multiple_choice": {
    const c = q.content as unknown as MultipleChoiceContent
    const correctCount = c.answers.filter(x => x.is_correct).length
    return a.multi.length === correctCount
  }
  case "fill_the_gap": {
    const { gaps } = q.content as unknown as { gaps: { index: number }[] }
    return gaps.every(g => !!a.fill[g.index - 1])
  }
  case "sorting": return a.sort.length > 0
  default: return false
  }
}
