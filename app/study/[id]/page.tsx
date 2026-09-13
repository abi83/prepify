import { notFound } from 'next/navigation'
import StudyPage from '@/screens/StudyPage'
import { ErrorState } from '@/components/ErrorState'
import { getSharedPrep } from '@/actions/preps'
import { listSharedQuestions } from '@/actions/questions'
import { listSharedAssets } from '@/actions/assets'
import { NotFoundError, ForbiddenError } from '@/repositories/errors'

// Data changes per-user-action and there's no DB access at build time — always render per-request.
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let prep
  try {
    prep = await getSharedPrep(id)
  } catch (e) {
    if (e instanceof NotFoundError) notFound()
    if (e instanceof ForbiddenError) return <ErrorState message="This prep is private." />
    throw e
  }

  const questions = await listSharedQuestions(id)
  const assets = questions.length > 0 ? await listSharedAssets(questions.map(q => q.id)) : []

  return <StudyPage prep={prep} questions={questions} assets={assets} />
}
