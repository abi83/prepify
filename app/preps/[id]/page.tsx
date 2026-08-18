import AuthGuard from '@/lib/AuthGuard'
import PrepPage from '@/screens/PrepPage'
import { getMyPrep } from '@/actions/preps'
import { listMyQuestions } from '@/actions/questions'
import { listMyAttempts } from '@/actions/attempts'
import { listMyAssets } from '@/actions/assets'
import { getExistingRunSummary, getConcepts } from '@/actions/pipeline'
import { NotFoundError, ForbiddenError } from '@/repositories/errors'

// Data changes per-user-action and there's no DB access at build time — always render per-request.
export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let prep
  try {
    prep = await getMyPrep(id)
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) {
      return (
        <AuthGuard>
          <PrepPage prep={null} />
        </AuthGuard>
      )
    }
    throw e
  }

  const [questions, attempts, runSummary, concepts] = await Promise.all([
    listMyQuestions(id),
    listMyAttempts(id),
    getExistingRunSummary(id),
    getConcepts(id),
  ])

  const assets = questions.length > 0 ? await listMyAssets(questions.map(q => q.id)) : []

  return (
    <AuthGuard>
      <PrepPage
        prep={prep}
        questions={questions}
        attempts={attempts}
        assets={assets}
        runSummary={runSummary}
        concepts={concepts ?? []}
      />
    </AuthGuard>
  )
}
