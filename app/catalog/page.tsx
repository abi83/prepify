import type { Metadata } from 'next'
import CatalogPage from './CatalogPage'
import { listCatalog } from '@/actions/preps'

// Data changes per-user-action and there's no DB access at build time — always render per-request.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Study Catalog',
  description: 'Browse publicly shared study sets — flashcards, quizzes, and tests for every subject.',
  openGraph: {
    title: 'Study Catalog',
    description: 'Browse publicly shared study sets — flashcards, quizzes, and tests for every subject.',
  },
}

export default async function Page() {
  const entries = await listCatalog()
  return <CatalogPage entries={entries} />
}
