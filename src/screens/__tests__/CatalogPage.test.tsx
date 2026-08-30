import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogEntry } from '../../repositories/prepRepository'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}))

import CatalogPage from '../CatalogPage'

function entry(overrides: Partial<CatalogEntry>): CatalogEntry {
  return {
    id: 'prep-1',
    userId: 'owner-1',
    title: 'Untitled',
    pages: null,
    createdAt: new Date('2026-01-15T00:00:00Z'),
    tokensUsed: 0,
    visibility: 'public',
    grade: null,
    discipline: null,
    language: null,
    questionCount: 0,
    ...overrides,
  }
}

function renderCatalog(entries: CatalogEntry[] = []) {
  return render(<CatalogPage entries={entries} />)
}

async function selectOption(user: ReturnType<typeof userEvent.setup>, triggerName: RegExp, optionName: string) {
  await user.click(screen.getByRole('combobox', { name: triggerName }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

beforeEach(() => {
  mockPush.mockClear()
})

describe('CatalogPage — empty state', () => {
  it('shows empty message when no public preps exist', () => {
    renderCatalog([])
    expect(screen.getByText(/no public preps yet/i)).toBeInTheDocument()
  })
})

describe('CatalogPage — listing preps', () => {
  const entries = [
    entry({
      id: 'prep-1',
      title: 'Cell Biology',
      grade: 10,
      discipline: 'Biology',
      createdAt: new Date('2026-01-15T00:00:00Z'),
      questionCount: 2,
    }),
    entry({
      id: 'prep-2',
      title: 'World War II',
      grade: 9,
      discipline: 'History',
      createdAt: new Date('2026-01-10T00:00:00Z'),
      questionCount: 1,
    }),
  ]

  it('renders page title', () => {
    renderCatalog(entries)
    expect(screen.getByText('Study Catalog')).toBeInTheDocument()
  })

  it('renders prep titles as links', () => {
    renderCatalog(entries)
    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
    expect(screen.getByText('World War II')).toBeInTheDocument()
  })

  it('renders discipline and grade tags', () => {
    renderCatalog(entries)
    const list = within(screen.getByRole('list'))
    expect(list.getByText('Biology')).toBeInTheDocument()
    expect(list.getByText('Grade 10')).toBeInTheDocument()
    expect(list.getByText('History')).toBeInTheDocument()
    expect(list.getByText('Grade 9')).toBeInTheDocument()
  })

  it('renders question counts', () => {
    renderCatalog(entries)
    expect(screen.getByText('2 questions')).toBeInTheDocument()
    expect(screen.getByText('1 questions')).toBeInTheDocument()
  })

  it('each prep card links to the study page', () => {
    renderCatalog(entries)
    const links = screen.getAllByRole('link').filter(l => l.getAttribute('href')?.startsWith('/study/'))
    expect(links.length).toBe(2)
    expect(links[0]).toHaveAttribute('href', '/study/prep-1')
    expect(links[1]).toHaveAttribute('href', '/study/prep-2')
  })
})

describe('CatalogPage — filtering', () => {
  const entries = [
    entry({ id: 'prep-1', title: 'Cell Biology', grade: 10, discipline: 'Biology', createdAt: new Date('2026-01-15T00:00:00Z') }),
    entry({ id: 'prep-2', title: 'World War II', grade: 9, discipline: 'History', createdAt: new Date('2026-01-10T00:00:00Z') }),
    entry({ id: 'prep-3', title: 'Genetics', grade: 11, discipline: 'Biology', createdAt: new Date('2026-01-05T00:00:00Z') }),
  ]

  it('filters preps by discipline', async () => {
    const user = userEvent.setup()
    renderCatalog(entries)

    await selectOption(user, /filter by subject/i, 'Biology')

    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
    expect(screen.getByText('Genetics')).toBeInTheDocument()
    expect(screen.queryByText('World War II')).not.toBeInTheDocument()
  })

  it('filters preps by grade', async () => {
    const user = userEvent.setup()
    renderCatalog(entries)

    await selectOption(user, /filter by grade/i, 'Grade 9')

    expect(screen.getByText('World War II')).toBeInTheDocument()
    expect(screen.queryByText('Cell Biology')).not.toBeInTheDocument()
    expect(screen.queryByText('Genetics')).not.toBeInTheDocument()
  })

  it('shows empty message when filters match nothing', async () => {
    const user = userEvent.setup()
    renderCatalog(entries)

    await selectOption(user, /filter by grade/i, 'Grade 13')

    expect(screen.getByText(/no preps match/i)).toBeInTheDocument()
  })

  it('restores all preps when filter is cleared', async () => {
    const user = userEvent.setup()
    renderCatalog(entries)

    await selectOption(user, /filter by grade/i, 'Grade 9')
    expect(screen.queryByText('Cell Biology')).not.toBeInTheDocument()

    await selectOption(user, /filter by grade/i, 'All grades')
    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
  })

  it('combines grade and discipline filters', async () => {
    const user = userEvent.setup()
    renderCatalog(entries)

    await selectOption(user, /filter by subject/i, 'Biology')
    await selectOption(user, /filter by grade/i, 'Grade 10')

    expect(screen.getByText('Cell Biology')).toBeInTheDocument()
    expect(screen.queryByText('Genetics')).not.toBeInTheDocument()
    expect(screen.queryByText('World War II')).not.toBeInTheDocument()
  })
})

describe('CatalogPage — navigation', () => {
  it('renders a back-to-home button', () => {
    renderCatalog([])
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
  })

  it('clicking back navigates to home', async () => {
    const user = userEvent.setup()
    renderCatalog([])
    await user.click(screen.getByRole('button', { name: /home/i }))
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})
