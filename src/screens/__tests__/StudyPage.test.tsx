import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Prep, Question } from '@prisma/client'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-prep-id' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('../../actions/attempts', () => ({
  insertAttempt: vi.fn().mockResolvedValue({}),
}))

import StudyPage from '../StudyPage'

function prep(overrides: Partial<Prep> = {}): Prep {
  return {
    id: 'test-prep-id',
    userId: 'owner-id',
    title: 'Biology Basics',
    pages: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    tokensUsed: 0,
    visibility: 'link',
    grade: 10,
    discipline: null,
    language: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StudyPage — not found', () => {
  it('shows not-available message when prep is null', () => {
    render(<StudyPage prep={null} />)
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('shows a home navigation button on not-found', () => {
    render(<StudyPage prep={null} />)
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
  })
})

describe('StudyPage — loaded with questions', () => {
  const questions: Question[] = [
    {
      id: 'q1', prepId: 'test-prep-id', createdAt: new Date(0), type: 'single_choice',
      content: {
        question: 'What is a cell?', rationale: '',
        answers: [
          { id: 'a', text: 'Basic unit', is_correct: true, explanation: '' },
          { id: 'b', text: 'Molecule', is_correct: false, explanation: '' },
        ],
      },
    },
    {
      id: 'q2', prepId: 'test-prep-id', createdAt: new Date(0), type: 'flashcard',
      content: { front: 'Cell', back: 'Basic unit of life' },
    },
  ]

  it('renders the prep title', () => {
    render(<StudyPage prep={prep()} questions={questions} />)
    expect(screen.getByText('Biology Basics')).toBeInTheDocument()
  })

  it('renders the Cards, Quiz, and Test tabs', () => {
    render(<StudyPage prep={prep()} questions={questions} />)
    expect(screen.getByRole('tab', { name: 'Cards' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Quiz' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Test' })).toBeInTheDocument()
  })

  it('shows quiz start button when Quiz tab is selected', async () => {
    const user = userEvent.setup()
    render(<StudyPage prep={prep()} questions={questions} />)
    await user.click(screen.getByRole('tab', { name: 'Quiz' }))
    expect(screen.getByRole('button', { name: /start quiz/i })).toBeInTheDocument()
  })

  it('shows test start button when Test tab is selected', async () => {
    const user = userEvent.setup()
    render(<StudyPage prep={prep()} questions={questions} />)
    await user.click(screen.getByRole('tab', { name: 'Test' }))
    expect(screen.getByRole('button', { name: /start test/i })).toBeInTheDocument()
  })
})

describe('StudyPage — anonymous user', () => {
  it('shows sign-in note for unauthenticated visitors', async () => {
    render(<StudyPage prep={prep({ title: 'Test Prep', visibility: 'public', grade: null })} />)
    expect(await screen.findByText(/sign in/i)).toBeInTheDocument()
  })
})
