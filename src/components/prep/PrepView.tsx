"use client"

import type { Asset, Question } from "@prisma/client"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useState, type ReactNode } from "react"

import AttemptFlow from "@/components/attempt/AttemptFlow"
import { Button } from "@/components/ui/button"
import { useUrlParams } from "@/lib/urlState"
import type { PrepTab } from "@/types/prep"

import PrepTabs, { type PrepTabEntry } from "./PrepTabs"

export const PREP_MAIN_CLASS = "mx-auto flex w-full max-w-[700px] flex-1 flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10"

interface Props<D extends object> {
  prepId: string
  studyQuestions: Question[]
  assets: Asset[]
  header: ReactNode
  tab: PrepTab
  tabs: PrepTabEntry<D>[]
  /** Builds the tab data; the view supplies the attempt starter. */
  tabData: (onStartAttempt: () => void) => D
  /** Renders a standalone "Start attempt" button above the tabs, for views without a Main tab. */
  startAttemptButton: boolean
  /** Dialogs and other owner-only overlays; hidden while an attempt runs. */
  children?: ReactNode
}

/** The prep screen shared by the owner and read-only routes: header, tabs, and the attempt flow. Differences are props. */
export default function PrepView<D extends object>({
  prepId, studyQuestions, assets, header, tab, tabs, tabData, startAttemptButton, children,
}: Props<D>) {
  const router = useRouter()
  const { set: setUrlParams } = useUrlParams()
  const { data: session } = useSession()
  const userId = session?.user.id ?? null
  const [ activeAttempt, setActiveAttempt ] = useState(false)

  function handleExitAttempt() {
    setActiveAttempt(false)
    router.refresh()
  }

  if (activeAttempt) {
    return (
      <main className={PREP_MAIN_CLASS}>
        <div className="flex items-center justify-between">
          <Button variant="link" className="h-11 p-0 text-muted-foreground" onClick={handleExitAttempt}>
            ← Back to Prep
          </Button>
          {!userId && <span className="text-sm text-muted-foreground">Sign in to save your results</span>}
        </div>
        <AttemptFlow questions={studyQuestions} assets={assets} prepId={prepId} userId={userId} onExit={handleExitAttempt} />
      </main>
    )
  }

  const startAttempt = () => setActiveAttempt(true)

  return (
    <main className={PREP_MAIN_CLASS}>
      {header}
      {startAttemptButton && (
        <div>
          <Button className="h-11" onClick={startAttempt} disabled={studyQuestions.length === 0}>Start attempt</Button>
        </div>
      )}
      <PrepTabs tab={tab} onTabChange={next => setUrlParams({ tab: next })} tabs={tabs} data={tabData(startAttempt)} />
      {children}
    </main>
  )
}
