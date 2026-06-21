import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Mutable state controlled per test
let mockPreps: object[] = []
let mockQuestions: object[] = []
let mockPrepsError: object | null = null

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, _val: string) => ({
          order: () =>
            Promise.resolve({
              data: table === 'preps' ? mockPreps : null,
              error: mockPrepsError,
            }),
          in: () => ({
            // questions count query
          }),
        }),
        in: (_col: string, _val: string[]) =>
          Promise.resolve({ data: mockQuestions, error: null }),
      }),
    }),
  },
}))

import CatalogPage from '../CatalogPage'

function renderCatalog() {
  return render(
    <MemoryRouter initialEntries={['/catalog']}>
      <Routes>
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/study/:id" element={<div>study page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockPreps = []
  mockQuestions = []
  mockPrepsError = null
  vi.clearAllMocks()
})

describe('CatalogPage — loading', () => {
  it('shows a spinner while loading', () => {
    renderCatalog()
    const spinner = document.querySelector('[class*="spinner"]')
    expect(spinner).toBeInTheDocument()
  })
})

describe('CatalogPage — empty state', () => {
  it('shows empty message when no public preps exist', async () => {
    mockPreps = []
    renderCatalog()
    await waitFor(() => {
      expect(screen.getByText(/no public preps yet/i)).toBeInTheDocument()
    })
  })
})

describe('CatalogPage — listing preps', () => {
  beforeEach(() => {
    mockPreps = [
      {
        id: 'prep-1',
        title: 'Cell Biology',
        grade: 10,
        discipline: 'Biology',
        created_at: '2026-01-15T00:00:00Z',
      },
      {
        id: 'prep-2',
        title: 'World War II',
        grade: 9,
        discipline: 'History',
        created_at: '2026-01-10T00:00:00Z',
      },
    ]
    mockQuestions = [
      { prep_id: 'prep-1' },
      { prep_id: 'prep-1' },
      { prep_id: 'prep-2' },
    ]
  })

  it('renders page title', async () => {
    renderCatalog()
    await waitFor(() => {
      expect(screen.getByText('Study Catalog')).toBeInTheDocument()
    })
  })

  it('renders prep titles as links', async () => {
    renderCatalog()
    await waitFor(() => {
      expect(screen.getByText('Cell Biology')).toBeInTheDocument()
      expect(screen.getByText('World War II')).toBeInTheDocument()
    })
  })

  it('renders discipline and grade tags', async () => {
    renderCatalog()
    await waitFor(() => {
      expect(screen.getByText('Biology')).toBeInTheDocument()
      expect(screen.getByText('Grade 10')).toBeInTheDocument()
      expect(screen.getByText('History')).toBeInTheDocument()
      expect(screen.getByText('Grade 9')).toBeInTheDocument()
    })
  })

  it('renders question counts', async () => {
    renderCatalog()
    await waitFor(() => {
      expect(screen.getByText('2 questions')).toBeInTheDocument()
      expect(screen.getByText('1 questions')).toBeInTheDocument()
    })
  })

  it('each prep card links to the study page', async () => {
    renderCatalog()
    await waitFor(() => {
      const links = screen.getAllByRole('link').filter(l => l.getAttribute('href')?.startsWith('/study/'))
      expect(links.length).toBe(2)
      expect(links[0]).toHaveAttribute('href', '/study/prep-1')
      expect(links[1]).toHaveAttribute('href', '/study/prep-2')
    })
  })
})

describe('CatalogPage — filtering', () => {
  beforeEach(() => {
    mockPreps = [
      {
        id: 'prep-1',
        title: 'Cell Biology',
        grade: 10,
        discipline: 'Biology',
        created_at: '2026-01-15T00:00:00Z',
      },
      {
        id: 'prep-2',
        title: 'World War II',
        grade: 9,
        discipline: 'History',
        created_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'prep-3',
        title: 'Genetics',
        grade: 11,
        discipline: 'Biology',
        created_at: '2026-01-05T00:00:00Z',
      },
    ]
    mockQuestions = []
  })

  it('filters preps by discipline', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await waitFor(() => screen.getByText('Cell Biology'))

    const disciplineSelect = screen.getByRole('combobox', { name: /filter by subject/i })
    await user.selectOptions(disciplineSelect, 'Biology')

    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
    expect(screen.getByText('Genetics')).toBeInTheDocument()
    expect(screen.queryByText('World War II')).not.toBeInTheDocument()
  })

  it('filters preps by grade', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await waitFor(() => screen.getByText('Cell Biology'))

    const gradeSelect = screen.getByRole('combobox', { name: /filter by grade/i })
    await user.selectOptions(gradeSelect, 'Grade 9')

    expect(screen.getByText('World War II')).toBeInTheDocument()
    expect(screen.queryByText('Cell Biology')).not.toBeInTheDocument()
    expect(screen.queryByText('Genetics')).not.toBeInTheDocument()
  })

  it('shows empty message when filters match nothing', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await waitFor(() => screen.getByText('Cell Biology'))

    const gradeSelect = screen.getByRole('combobox', { name: /filter by grade/i })
    await user.selectOptions(gradeSelect, 'Grade 13')

    expect(screen.getByText(/no preps match/i)).toBeInTheDocument()
  })

  it('restores all preps when filter is cleared', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await waitFor(() => screen.getByText('Cell Biology'))

    const gradeSelect = screen.getByRole('combobox', { name: /filter by grade/i })
    await user.selectOptions(gradeSelect, 'Grade 9')
    expect(screen.queryByText('Cell Biology')).not.toBeInTheDocument()

    await user.selectOptions(gradeSelect, 'All grades')
    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
  })

  it('combines grade and discipline filters', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await waitFor(() => screen.getByText('Cell Biology'))

    await user.selectOptions(screen.getByRole('combobox', { name: /filter by subject/i }), 'Biology')
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by grade/i }), 'Grade 10')

    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
    expect(screen.queryByText('Genetics')).not.toBeInTheDocument()
    expect(screen.queryByText('World War II')).not.toBeInTheDocument()
  })
})

describe('CatalogPage — navigation', () => {
  it('renders a back-to-home button', async () => {
    renderCatalog()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
    })
  })

  it('clicking back navigates to home', async () => {
    const user = userEvent.setup()
    renderCatalog()
    await waitFor(() => screen.getByRole('button', { name: /home/i }))
    await user.click(screen.getByRole('button', { name: /home/i }))
    expect(screen.getByText('home')).toBeInTheDocument()
  })
})
