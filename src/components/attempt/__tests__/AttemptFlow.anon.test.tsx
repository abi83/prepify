import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Question } from '../../../types/questions'

const insertMock = vi.fn().mockResolvedValue({ error: null })

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({ insert: insertMock }),
  },
}))

import AttemptFlow from '../AttemptFlow'

const singleQ: Question = {
  id: 'q1', prep_id: 'p1', created_at: '', type: 'single_choice',
  content: {
    question: 'What is 2+2?', rationale: '',
    answers: [
      { id: 'a', text: '4', is_correct: true, explanation: '' },
      { id: 'b', text: '5', is_correct: false, explanation: '' },
    ],
  },
}

async function runThroughAttempt(userId: string | null, mode: 'quiz' | 'test') {
  const user = userEvent.setup()
  const onExit = vi.fn()

  render(
    <AttemptFlow
      questions={[singleQ]}
      mode={mode}
      prepId="prep-1"
      userId={userId}
      onExit={onExit}
    />,
  )

  // Answers render as buttons; the answer text is inside a span within the button.
  // Click the span containing the answer text — userEvent will bubble up to the button.
  const optionText = await screen.findByText('4')
  await user.click(optionText)

  if (mode === 'quiz') {
    await user.click(screen.getByRole('button', { name: /submit answer/i }))
    // After submitting, the last question shows Finish
    await waitFor(() => screen.getByRole('button', { name: /finish/i }))
    await user.click(screen.getByRole('button', { name: /finish/i }))
  } else {
    await waitFor(() => screen.getByRole('button', { name: /submit test/i }))
    await user.click(screen.getByRole('button', { name: /submit test/i }))
  }

  // Confirm dialog
  await waitFor(() => screen.getByRole('button', { name: /confirm/i }))
  await user.click(screen.getByRole('button', { name: /confirm/i }))
}

beforeEach(() => {
  insertMock.mockClear()
})

describe('AttemptFlow — attempt saving', () => {
  it('saves attempt when userId is provided', async () => {
    await runThroughAttempt('user-123', 'quiz')
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-123', prep_id: 'prep-1', mode: 'quiz' }),
      )
    })
  })

  it('skips DB insert when userId is null', async () => {
    await runThroughAttempt(null, 'quiz')
    await waitFor(() => screen.getByText(/quiz complete/i))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('shows score screen after finalize regardless of userId', async () => {
    await runThroughAttempt(null, 'test')
    await waitFor(() => {
      expect(screen.getByText(/test complete/i)).toBeInTheDocument()
    })
  })

  it('shows sign-in hint in quiz confirm dialog when anonymous', async () => {
    const user = userEvent.setup()
    render(
      <AttemptFlow
        questions={[singleQ]}
        mode="quiz"
        prepId="prep-1"
        userId={null}
        onExit={vi.fn()}
      />,
    )
    await user.click(screen.getByText('4'))
    await user.click(screen.getByRole('button', { name: /submit answer/i }))
    await user.click(screen.getByRole('button', { name: /finish/i }))
    await waitFor(() => {
      expect(screen.getByText(/sign in to save/i)).toBeInTheDocument()
    })
  })
})
