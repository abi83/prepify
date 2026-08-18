import { describe, it, expect } from 'vitest'
import { isAnswerValid } from '../AttemptFlow'
import { emptyAnswer } from '../../questions/QuestionBody'
import type { Question } from '@prisma/client'

const NO_ASSET = { needed: false, type: null, description: null } as const

const singleQ: Question = {
  id: 'q1', prepId: 'p1', createdAt: new Date(0), type: 'single_choice',
  content: {
    question: 'Q?', rationale: '', asset_hint: NO_ASSET,
    answers: [
      { id: 'a', text: 'A', is_correct: true,  explanation: '' },
      { id: 'b', text: 'B', is_correct: false, explanation: '' },
      { id: 'c', text: 'C', is_correct: false, explanation: '' },
      { id: 'd', text: 'D', is_correct: false, explanation: '' },
    ],
  },
}

const multiQ: Question = {
  id: 'q2', prepId: 'p1', createdAt: new Date(0), type: 'multiple_choice',
  content: {
    question: 'Q?', rationale: '', asset_hint: NO_ASSET,
    answers: [
      { id: 'a', text: 'A', is_correct: true,  explanation: '' },
      { id: 'b', text: 'B', is_correct: false, explanation: '' },
      { id: 'c', text: 'C', is_correct: true,  explanation: '' },
      { id: 'd', text: 'D', is_correct: false, explanation: '' },
      { id: 'e', text: 'E', is_correct: true,  explanation: '' },
    ],
  },
}

describe('isAnswerValid — single_choice', () => {
  it('is invalid with no selection', () => {
    expect(isAnswerValid(singleQ, emptyAnswer())).toBe(false)
  })

  it('is valid with any selection', () => {
    expect(isAnswerValid(singleQ, { ...emptyAnswer(), single: 'b' })).toBe(true)
  })
})

describe('isAnswerValid — multiple_choice', () => {
  it('is invalid with no selections', () => {
    expect(isAnswerValid(multiQ, emptyAnswer())).toBe(false)
  })

  it('is invalid with fewer than required selections', () => {
    expect(isAnswerValid(multiQ, { ...emptyAnswer(), multi: ['a'] })).toBe(false)
    expect(isAnswerValid(multiQ, { ...emptyAnswer(), multi: ['a', 'c'] })).toBe(false)
  })

  it('is valid only when exactly N answers are selected', () => {
    expect(isAnswerValid(multiQ, { ...emptyAnswer(), multi: ['a', 'c', 'e'] })).toBe(true)
  })

  it('is invalid with more than required selections', () => {
    expect(isAnswerValid(multiQ, { ...emptyAnswer(), multi: ['a', 'b', 'c', 'e'] })).toBe(false)
  })
})
