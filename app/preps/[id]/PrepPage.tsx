'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import type { Prep, Question, Attempt, Asset } from '@prisma/client'
import { parseStudyTab, type StudyTab, type Page } from '@/types/prep'
import { useUrlParams } from '@/lib/urlState'
import type { FlashcardContent } from '@/types/questions'
import type { Concept } from '@/types/pipeline'
import { getApiKey, estimateCost, formatCost } from '@/lib/apiKey'
import { formatDate } from '@/lib/format'
import { deletePrep } from '@/actions/preps'
import { disciplineFromEnum, disciplineToEnum } from '@/lib/disciplineMapping'
import GenerationPanel from './GenerationPanel'
import PageSection from './PageSection'
import StudyTabs from '@/components/StudyTabs'
import AttemptFlow from '@/components/attempt/AttemptFlow'
import ShareModal from '@/components/ShareModal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  prep: Prep
  questions: Question[]
  attempts: Attempt[]
  assets: Asset[]
  runSummary: import('@/repositories/pipelineRepository').PartialRunSummary | null
  concepts: Concept[]
}

export default function PrepPage({
  prep: initialPrep,
  questions: initialQuestions,
  attempts,
  assets,
  runSummary,
  concepts,
}: Props) {
  const router = useRouter()
  const { searchParams, set: setUrlParams } = useUrlParams()

  const [prep, setPrep] = useState<Prep>(initialPrep)
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [activeAttempt, setActiveAttempt] = useState<StudyTab | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => setPrep(initialPrep), [initialPrep])
  useEffect(() => setQuestions(initialQuestions), [initialQuestions])

  const { data: session } = useSession()
  const userId = session?.user.id ?? null

  const tab = parseStudyTab(searchParams.get('tab'))
  function setTab(next: StudyTab) { setUrlParams({ tab: next }) }

  const pages = (prep.pages as unknown as Page[]) ?? []
  const hasQuestions = questions.length > 0
  const flashcards = questions.filter(q => q.type === 'flashcard').map(q => q.content as unknown as FlashcardContent)
  const studyQuestions = questions.filter(q => q.type !== 'flashcard')

  async function handleDelete() {
    setDeleting(true)
    await deletePrep(prep.id)
    router.push('/preps')
  }

  function handleExitAttempt() {
    setActiveAttempt(null)
    router.refresh()
  }

  if (activeAttempt && (activeAttempt === 'quiz' || activeAttempt === 'test') && userId) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={handleExitAttempt}>← Back to Prep</Button>
        </header>
        <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
          <AttemptFlow
            questions={studyQuestions}
            assets={assets}
            mode={activeAttempt}
            prepId={prep.id}
            userId={userId}
            onExit={handleExitAttempt}
          />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete prep?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{prep.title}</strong> and all its questions, attempts, and pipeline data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Button asChild variant="link" className="h-auto p-0 text-muted-foreground">
          <Link href="/preps">← My Preps</Link>
        </Button>
        <div className="flex items-center gap-4">
          {prep.userId === userId && hasQuestions && (
            <Button size="sm" onClick={() => setShowShareModal(true)}>
              {prep.visibility === 'private' ? 'Share' : 'Shared'}
            </Button>
          )}
          {prep.userId === userId && (
            <Button variant="link" className="h-auto p-0 text-sm text-error" onClick={() => setShowDeleteConfirm(true)}>Delete</Button>
          )}
          <Button asChild variant="link" className="h-auto p-0 text-sm text-muted-foreground">
            <Link href="/settings">Settings</Link>
          </Button>
        </div>
      </header>

      {showShareModal && prep.userId === userId && (
        <ShareModal
          prepId={prep.id}
          concepts={concepts}
          apiKey={getApiKey()?.key ?? ''}
          model={getApiKey()?.model ?? 'gpt-5-nano'}
          initialVisibility={prep.visibility}
          initialGrade={prep.grade}
          initialDiscipline={disciplineFromEnum(prep.discipline)}
          onSave={(visibility, grade, discipline) => {
            setPrep(p => ({ ...p, visibility, grade, discipline: disciplineToEnum(discipline) }))
            router.refresh()
          }}
          onClose={() => setShowShareModal(false)}
        />
      )}

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">{prep.title}</h1>
          {prep.description && (
            <p className="text-sm text-muted-foreground">{prep.description}</p>
          )}
          <span className="text-sm text-muted-foreground">{formatDate(prep.createdAt)}</span>
          {prep.tokensUsed > 0 && (
            <span className="text-xs text-muted-foreground">
              {prep.tokensUsed.toLocaleString()} tokens
              {getApiKey() && (
                <> · ~{formatCost(estimateCost(prep.tokensUsed * 0.8, prep.tokensUsed * 0.2, getApiKey()!.model))}</>
              )}
            </span>
          )}
        </div>

        {pages.map(page => (
          <PageSection key={page.page} page={page} />
        ))}

        <GenerationPanel
          prepId={prep.id}
          pages={pages}
          language={prep.language ?? 'en'}
          prepTitle={prep.title}
          initialRunSummary={runSummary}
          hasQuestions={hasQuestions}
          onTitleReady={title => setPrep(p => ({ ...p, title }))}
          onComplete={(savedQuestions, freshPrep) => {
            setQuestions(savedQuestions)
            setPrep(freshPrep)
          }}
        />

        {hasQuestions && (
          <>
            <StudyTabs
              tab={tab}
              onTabChange={setTab}
              flashcards={flashcards}
              studyQuestions={studyQuestions}
              onStartAttempt={mode => setActiveAttempt(mode)}
            />

            {attempts.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">Attempt history</h3>
                <div className="flex flex-col gap-1.5">
                  {attempts.map(a => (
                    <div key={a.id} className="flex items-center gap-3 rounded-sm border border-border bg-background px-4 py-3 text-sm">
                      <span className="min-w-[40px] font-semibold capitalize">{a.mode}</span>
                      <span className="font-semibold text-primary">
                        {a.score}/{a.total} ({Math.round((a.score / a.total) * 100)}%)
                      </span>
                      <span className="ml-auto text-muted-foreground">{formatDate(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

