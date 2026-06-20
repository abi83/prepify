import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SingleChoiceQuestion from '../SingleChoiceQuestion'
import type { SingleChoiceContent } from '../../../types/questions'

const content: SingleChoiceContent = {
  question: 'What is the capital of France?',
  rationale: 'Paris is the capital.',
  answers: [
    { id: 'a', text: 'Berlin', is_correct: false, explanation: 'Capital of Germany.' },
    { id: 'b', text: 'Paris',  is_correct: true,  explanation: 'Capital of France.' },
    { id: 'c', text: 'Rome',   is_correct: false, explanation: 'Capital of Italy.' },
    { id: 'd', text: 'Madrid', is_correct: false, explanation: 'Capital of Spain.' },
  ],
}

describe('SingleChoiceQuestion', () => {
  it('renders all answer options', () => {
    render(<SingleChoiceQuestion content={content} selected={null} isReview={false} />)
    expect(screen.getByText('Berlin')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText('Rome')).toBeInTheDocument()
    expect(screen.getByText('Madrid')).toBeInTheDocument()
  })

  it('calls onChange with the clicked option id', async () => {
    const onChange = vi.fn()
    render(<SingleChoiceQuestion content={content} selected={null} isReview={false} onChange={onChange} />)
    await userEvent.click(screen.getByText('Paris').closest('button')!)
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('switches selection when a different option is clicked', async () => {
    const onChange = vi.fn()
    render(<SingleChoiceQuestion content={content} selected={'a'} isReview={false} onChange={onChange} />)
    await userEvent.click(screen.getByText('Paris').closest('button')!)
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('does not fire onChange in review mode', async () => {
    const onChange = vi.fn()
    render(<SingleChoiceQuestion content={content} selected={null} isReview={true} onChange={onChange} />)
    await userEvent.click(screen.getByText('Paris').closest('button')!)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows explanation only for correct and wrong answers in review mode', () => {
    render(
      <SingleChoiceQuestion
        content={content}
        selected={'a'}  // wrong pick
        isReview={true}
      />
    )
    // correct answer explanation shown
    expect(screen.getByText('Capital of France.')).toBeInTheDocument()
    // wrong pick explanation shown
    expect(screen.getByText('Capital of Germany.')).toBeInTheDocument()
    // untouched options have no explanation rendered
    expect(screen.queryByText('Capital of Italy.')).not.toBeInTheDocument()
    expect(screen.queryByText('Capital of Spain.')).not.toBeInTheDocument()
  })
})
