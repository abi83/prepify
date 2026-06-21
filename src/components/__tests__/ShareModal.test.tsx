import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
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
    expect(linkBtn).toHaveClass(/visBtnActive/)
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
    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { container } = render(<ShareModal {...baseProps} onClose={onClose} />)
    const overlay = container.firstChild as HTMLElement
    await user.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
