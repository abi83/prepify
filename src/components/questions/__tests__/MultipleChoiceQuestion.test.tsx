import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import MultipleChoiceQuestion from '../MultipleChoiceQuestion'
import type { MultipleChoiceContent } from '../../../types/questions'

const content: MultipleChoiceContent = {
  question: 'Which are primary colors?',
  rationale: 'Red, blue, yellow are primary.',
  answers: [
    { id: 'a', text: 'Red',    is_correct: true,  explanation: 'Primary color.' },
    { id: 'b', text: 'Green',  is_correct: false, explanation: 'Secondary color.' },
    { id: 'c', text: 'Blue',   is_correct: true,  explanation: 'Primary color.' },
    { id: 'd', text: 'Purple', is_correct: false, explanation: 'Secondary color.' },
    { id: 'e', text: 'Yellow', is_correct: true,  explanation: 'Primary color.' },
  ],
}

describe('MultipleChoiceQuestion', () => {
  it('shows the required selection count hint', () => {
    render(<MultipleChoiceQuestion content={content} selected={[]} isReview={false} />)
    expect(screen.getByText('Select 3 answers')).toBeInTheDocument()
  })

  it('calls onChange when an unselected option is clicked', async () => {
    const onChange = vi.fn()
    render(<MultipleChoiceQuestion content={content} selected={[]} isReview={false} onChange={onChange} />)
    await userEvent.click(screen.getByText('Red').closest('button')!)
    expect(onChange).toHaveBeenCalledWith(['a'])
  })

  it('deselects an already-selected option', async () => {
    const onChange = vi.fn()
    render(<MultipleChoiceQuestion content={content} selected={['a', 'c']} isReview={false} onChange={onChange} />)
    await userEvent.click(screen.getByText('Red').closest('button')!)
    expect(onChange).toHaveBeenCalledWith(['c'])
  })

  it('does not allow selecting more than correctCount options', async () => {
    const onChange = vi.fn()
    // Already at cap (3 of 3 correct)
    render(
      <MultipleChoiceQuestion
        content={content}
        selected={['a', 'c', 'e']}
        isReview={false}
        onChange={onChange}
      />
    )
    await userEvent.click(screen.getByText('Green').closest('button')!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not fire onChange in review mode', async () => {
    const onChange = vi.fn()
    render(<MultipleChoiceQuestion content={content} selected={[]} isReview={true} onChange={onChange} />)
    await userEvent.click(screen.getByText('Red').closest('button')!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows explanations in review mode for correct and wrong picks', () => {
    render(
      <MultipleChoiceQuestion
        content={content}
        selected={['a', 'b']}  // 'a' correct, 'b' wrong
        isReview={true}
      />
    )
    // Multiple correct answers share the same explanation text — all should be present
    expect(screen.getAllByText('Primary color.').length).toBeGreaterThan(0)
    // The wrong pick's explanation should also be shown
    expect(screen.getByText('Secondary color.')).toBeInTheDocument()
  })
})
