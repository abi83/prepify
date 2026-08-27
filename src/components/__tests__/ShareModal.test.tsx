import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../actions/preps', () => ({
  updatePrep: vi.fn().mockResolvedValue({}),
}))

vi.mock('../../lib/agents/PrepLabeler', async () => {
  const actual = await vi.importActual<typeof import('../../lib/agents/PrepLabeler')>(
    '../../lib/agents/PrepLabeler',
  )
  return {
    ...actual,
    runPrepLabeler: vi.fn().mockResolvedValue({
      output: { grade: 9, discipline: 'Biology', confidence: 0.9 },
      metrics: { latency_ms: 100, prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
    }),
  }
})

import ShareModal from '../ShareModal'

const baseProps = {
  prepId: 'prep-123',
  concepts: [],
  apiKey: 'sk-test',
  model: 'gpt-5-nano',
  initialVisibility: 'private' as const,
  initialGrade: null,
  initialDiscipline: null,
  onSave: vi.fn(),
  onClose: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShareModal — initial render', () => {
  it('shows the publish form when prep is private', () => {
    render(<ShareModal {...baseProps} />)
    expect(screen.getByText('Share prep')).toBeInTheDocument()
    expect(screen.getByText('Publish')).toBeInTheDocument()
  })

  it('shows published state immediately when prep is already shared', () => {
    render(
      <ShareModal
        {...baseProps}
        initialVisibility="link"
        initialGrade={8}
        initialDiscipline="Chemistry"
      />,
    )
    expect(screen.getByText(/Anyone with the link/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /make private/i })).toBeInTheDocument()
  })

  it('defaults to Link only visibility', () => {
    render(<ShareModal {...baseProps} />)
    const linkBtn = screen.getByRole('button', { name: /link only/i })
    expect(linkBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows "publicly listed" text when initialVisibility is public', () => {
    render(<ShareModal {...baseProps} initialVisibility="public" />)
    expect(screen.getByText(/This prep is publicly listed/)).toBeInTheDocument()
  })
})

describe('ShareModal — visibility toggle', () => {
  it('switches visibility hint when Public is selected', async () => {
    const user = userEvent.setup()
    render(<ShareModal {...baseProps} initialGrade={5} initialDiscipline="Mathematics" />)
    await user.click(screen.getByRole('button', { name: /public/i }))
    expect(screen.getByText(/Listed publicly/)).toBeInTheDocument()
  })
})

describe('ShareModal — dismiss', () => {
  it('calls onClose when × is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ShareModal {...baseProps} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ShareModal {...baseProps} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking outside the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ShareModal {...baseProps} onClose={onClose} />)
    await user.click(document.documentElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ShareModal — accessibility', () => {
  it('renders as an accessible modal dialog', () => {
    render(<ShareModal {...baseProps} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Share prep')
  })

  it('moves focus inside the dialog on open', () => {
    render(<ShareModal {...baseProps} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('returns focus to the trigger element on close', async () => {
    const user = userEvent.setup()
    const trigger = document.createElement('button')
    trigger.textContent = 'Share'
    document.body.appendChild(trigger)
    trigger.focus()

    const onClose = vi.fn()
    const { unmount } = render(<ShareModal {...baseProps} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    trigger.remove()
  })
})
