"use client"

import type { Prep, Question, Attempt, Asset, PrepImage } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState } from "react"

import { deletePrep } from "@/actions/preps"
import AttemptFlow from "@/components/attempt/AttemptFlow"
import ConceptCard from "@/components/ConceptCard"
import ConceptGenerationSummary from "@/components/ConceptGenerationSummary"
import GenerationCost, { formatUsage } from "@/components/GenerationCost"
import ShareModal from "@/components/ShareModal"
import StudyTabs from "@/components/StudyTabs"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getApiKey } from "@/lib/apiKey"
import { disciplineFromEnum, disciplineToEnum } from "@/lib/disciplineMapping"
import { formatDate } from "@/lib/format"
import { useUrlParams } from "@/lib/urlState"
import type { JobGeneration, PrepProgress, StatedConcept } from "@/repositories/prepStateRepository"
import { parseStudyTab, type StudyTab, type Page, ocrResultSchema } from "@/types/prep"
import type { FlashcardContent } from "@/types/questions"

import GenerationPanel from "./GenerationPanel"
import PageSection from "./PageSection"

function uniqueGenerations(concepts: StatedConcept[]) {
  return [ ...new Map(concepts.map(c => [ c.generation.jobId, c.generation ])).values() ]
}

/** The generation of the job that produced an entity; null when that job is gone. */
function generationOf(jobId: string | null, generations: Record<string, JobGeneration>): JobGeneration | null {
  if (jobId === null) return null
  return generations[jobId] ?? null
}

// ── Main component ──────────────────────────────────────────────────────────

interface Props {
  prep: Prep
  questions: Question[]
  attempts: Attempt[]
  assets: Asset[]
  progress: PrepProgress | null
  tokensUsed: number
  costUsd: number
  concepts: StatedConcept[]
  images: PrepImage[]
  generations: Record<string, JobGeneration>
}

export default function PrepPage({
  prep: initialPrep,
  questions: initialQuestions,
  attempts,
  assets,
  progress,
  tokensUsed,
  costUsd,
  concepts,
  images,
  generations,
}: Props) {
  const router = useRouter()
  const { searchParams, set: setUrlParams } = useUrlParams()

  const [ prep, setPrep ] = useState<Prep>(initialPrep)
  const [ prevInitialPrep, setPrevInitialPrep ] = useState(initialPrep)
  if (initialPrep !== prevInitialPrep) {
    setPrevInitialPrep(initialPrep)
    setPrep(initialPrep)
  }

  const [ questions, setQuestions ] = useState<Question[]>(initialQuestions)
  const [ prevInitialQuestions, setPrevInitialQuestions ] = useState(initialQuestions)
  if (initialQuestions !== prevInitialQuestions) {
    setPrevInitialQuestions(initialQuestions)
    setQuestions(initialQuestions)
  }

  const [ activeAttempt, setActiveAttempt ] = useState(false)
  const [ showShareModal, setShowShareModal ] = useState(false)
  const [ showDeleteConfirm, setShowDeleteConfirm ] = useState(false)
  const [ deleting, setDeleting ] = useState(false)

  const { data: session } = useSession()
  const userId = session?.user.id ?? null

  const tab = parseStudyTab(searchParams.get("tab"))
  function setTab(next: StudyTab) { setUrlParams({ tab: next }) }

  const ocrImages = images.filter(img => img.ocrResult !== null)
  const pages: Page[] = ocrImages.map((img, i) => {
    if (!img.language) throw new Error(`PrepImage ${img.id} has an OCR result but no language`)
    return { page: i + 1, gcsKey: img.gcsKey, language: img.language, ...ocrResultSchema.parse(img.ocrResult) }
  })
  const questionGenerations = questions.map(q => generationOf(q.producedByJobId, generations))
  const questionJobGenerations = [ ...new Map(questionGenerations.filter(g => g !== null).map(g => [ g.jobId, g ])).values() ]
  const hasQuestions = questions.length > 0
  const flashcards = questions.filter(q => q.type === "flashcard").map(q => q.content as unknown as FlashcardContent)
  const studyQuestions = questions.filter(q => q.type !== "flashcard")
  const isOwner = prep.userId === userId

  async function handleDelete() {
    setDeleting(true)
    await deletePrep(prep.id)
    router.push("/preps")
  }

  function handleExitAttempt() {
    setActiveAttempt(false)
    router.refresh()
  }

  if (activeAttempt && userId) {
    return (
      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-7 px-6 py-10">
        <Button variant="link" className="h-auto self-start p-0 text-muted-foreground" onClick={handleExitAttempt}>
          ← Back to Prep
        </Button>
        <AttemptFlow
          questions={studyQuestions}
          assets={assets}
          prepId={prep.id}
          userId={userId}
          onExit={handleExitAttempt}
        />
      </main>
    )
  }

  return (
    <>
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete prep?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{prep.title}</strong> and all its questions, attempts, and generation data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showShareModal && isOwner && (
        <ShareModal
          prepId={prep.id}
          concepts={concepts}
          apiKey={getApiKey()?.key ?? ""}
          model={getApiKey()?.model ?? "gpt-5-nano"}
          tier={getApiKey()?.tier ?? "flex"}
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
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-highlight text-2xl font-bold tracking-tight">{prep.title}</h1>
            {isOwner && (
              <div className="flex shrink-0 items-center gap-3 pt-1">
                {hasQuestions && (
                  <Button size="sm" onClick={() => setShowShareModal(true)}>
                    {prep.visibility === "private" ? "Share" : "Shared"}
                  </Button>
                )}
                <Button variant="link" className="h-auto p-0 text-sm text-error" onClick={() => setShowDeleteConfirm(true)}>
                  Delete
                </Button>
              </div>
            )}
          </div>
          {prep.description && (
            <p className="text-sm text-muted-foreground">{prep.description}</p>
          )}
          <span className="text-sm text-muted-foreground">{formatDate(prep.createdAt)}</span>
          {tokensUsed > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatUsage(tokensUsed, costUsd)}
            </span>
          )}
        </div>

        {pages.map((page, i) => (
          <PageSection key={page.page} prepId={prep.id} page={page} generation={generationOf(ocrImages[i].producedByJobId, generations)} />
        ))}

        {concepts.length > 0 && (
          <>
            <ul aria-label="Concepts" className="flex flex-col gap-3">
              {concepts.map(c => (
                <li key={c.id}><ConceptCard concept={c} /></li>
              ))}
            </ul>
            <ConceptGenerationSummary generations={uniqueGenerations(concepts)} />
          </>
        )}

        <GenerationPanel
          prepId={prep.id}
          prepTitle={prep.title}
          initialProgress={progress}
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
              assets={assets}
              onStartAttempt={() => setActiveAttempt(true)}
            />

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Question generation</h3>
              <ul aria-label="Questions" className="flex flex-col gap-1">
                {questions.map((q, i) => {
                  const generation = questionGenerations[i]
                  return (
                    <li key={q.id} className="flex flex-col text-xs">
                      <span className="font-semibold capitalize">{i + 1}. {q.type.replace(/_/g, " ")}</span>
                      {generation && <GenerationCost generations={[ generation ]} />}
                    </li>
                  )
                })}
              </ul>
              {questionJobGenerations.length > 0 && (
                <div aria-label="Questions total" role="group" className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold">Total</span>
                  <GenerationCost generations={questionJobGenerations} />
                </div>
              )}
            </section>

            {attempts.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">Attempt history</h3>
                <div className="flex flex-col gap-1.5">
                  {attempts.map(a => (
                    <div key={a.id} className="flex items-center gap-3 rounded-sm border border-border bg-background px-4 py-3 text-sm">
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
    </>
  )
}
