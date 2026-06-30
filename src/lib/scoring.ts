import type { Question } from '../types/questions'
import type { AnswerState } from '../components/questions/QuestionBody'

export function isAnswerCorrect(q: Question, a: AnswerState): boolean {
  switch (q.type) {
    case 'single_choice': {
      const c = (q.content as { answers: { id: string; is_correct: boolean }[] }).answers
      return c.find(x => x.id === a.single)?.is_correct ?? false
    }
    case 'multiple_choice': {
      const c = (q.content as { answers: { id: string; is_correct: boolean }[] }).answers
      const correct = new Set(c.filter(x => x.is_correct).map(x => x.id))
      const given = new Set(a.multi)
      return correct.size === given.size && [...correct].every(id => given.has(id))
    }
    case 'fill_the_gap': {
      const { gaps } = q.content as { gaps: { index: number; correct_answer_id: string }[] }
      return gaps.every(g => a.fill[g.index - 1] === g.correct_answer_id)
    }
    case 'sorting': {
      const { answers } = q.content as { answers: { id: string; correct_index: number }[] }
      return answers.every(ans => a.sort.indexOf(ans.id) + 1 === ans.correct_index)
    }
    default: return false
  }
}
