import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Supabase mock — controlled per test via mockPrep / mockQuestions
let mockPrep: object | null = null
let mockQuestions: object[] = []

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          single: () =>
            table === 'preps'
              ? Promise.resolve({ data: mockPrep, error: mockPrep ? null : { code: 'PGRST116' } })
              : Promise.resolve({ data: null, error: null }),
          order: () => Promise.resolve({ data: mockQuestions, error: null }),
        }),
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}))

import StudyPage from '../StudyPage'

function renderStudyPage(id = 'test-prep-id') {
  return render(
    <MemoryRouter initialEntries={[`/study/${id}`]}>
      <Routes>
        <Route path="/study/:id" element={<StudyPage />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockPrep = null
  mockQuestions = []
  vi.clearAllMocks()
})

describe('StudyPage — loading', () => {
  it('shows a spinner while data is loading', () => {
    // The spinner is rendered while loading=true (before promises resolve).
    // CSS modules rename class names, so we locate it by role/aria or by tag+animation.
    // A spinner div has no role, so we check a custom data-testid or just that it exists.
    // Since we control the mock, stall resolution to ensure loading state is visible.
    renderStudyPage()
    // The spinner element exists in the DOM (CSS modules scope the class name but the
    // element is still in the document tree).
    const spinner = document.querySelector('[class*="spinner"]')
    expect(spinner).toBeInTheDocument()
  })
})

describe('StudyPage — not found', () => {
  it('shows not-available message when prep is null', async () => {
    mockPrep = null
    renderStudyPage()
    await waitFor(() => {
      expect(screen.getByText(/not available/i)).toBeInTheDocument()
    })
  })

  it('shows a home navigation button on not-found', async () => {
    mockPrep = null
    renderStudyPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    })
  })
})

describe('StudyPage — loaded with questions', () => {
  beforeEach(() => {
    mockPrep = {
      id: 'test-prep-id',
      user_id: 'owner-id',
      title: 'Biology Basics',
      raw_text: 'some text',
      visibility: 'link',
      grade: 10,
      discipline: 'Biology',
      study_description: 'A quick overview of cells.',
      created_at: '2026-01-01T00:00:00Z',
      tokens_used: 0,
    }
    mockQuestions = [
      {
        id: 'q1', prep_id: 'test-prep-id', created_at: '', type: 'single_choice',
        content: {
          question: 'What is a cell?', rationale: '',
          answers: [
            { id: 'a', text: 'Basic unit', is_correct: true, explanation: '' },
            { id: 'b', text: 'Molecule', is_correct: false, explanation: '' },
          ],
        },
      },
      {
        id: 'q2', prep_id: 'test-prep-id', created_at: '', type: 'flashcard',
        content: { front: 'Cell', back: 'Basic unit of life' },
      },
    ]
  })

  it('renders the prep title', async () => {
    renderStudyPage()
    await waitFor(() => {
      expect(screen.getByText('Biology Basics')).toBeInTheDocument()
    })
  })

  it('renders the study description', async () => {
    renderStudyPage()
    await waitFor(() => {
      expect(screen.getByText('A quick overview of cells.')).toBeInTheDocument()
    })
  })

  it('renders the Cards, Quiz, and Test tabs', async () => {
    renderStudyPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cards' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quiz' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument()
    })
  })

  it('shows quiz start button when Quiz tab is selected', async () => {
    const user = userEvent.setup()
    renderStudyPage()
    await waitFor(() => screen.getByRole('button', { name: 'Quiz' }))
    await user.click(screen.getByRole('button', { name: 'Quiz' }))
    expect(screen.getByRole('button', { name: /start quiz/i })).toBeInTheDocument()
  })

  it('shows test start button when Test tab is selected', async () => {
    const user = userEvent.setup()
    renderStudyPage()
    await waitFor(() => screen.getByRole('button', { name: 'Test' }))
    await user.click(screen.getByRole('button', { name: 'Test' }))
    expect(screen.getByRole('button', { name: /start test/i })).toBeInTheDocument()
  })
})

describe('StudyPage — anonymous user', () => {
  it('shows sign-in note for unauthenticated visitors', async () => {
    mockPrep = {
      id: 'test-prep-id',
      user_id: 'owner-id',
      title: 'Test Prep',
      raw_text: '',
      visibility: 'public',
      grade: null,
      discipline: null,
      study_description: null,
      created_at: '2026-01-01T00:00:00Z',
      tokens_used: 0,
    }
    renderStudyPage()
    await waitFor(() => {
      expect(screen.getByText(/sign in/i)).toBeInTheDocument()
    })
  })
})
