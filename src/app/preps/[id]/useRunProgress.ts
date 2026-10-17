"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { getMyPrepProgress } from "@/actions/prepState"
import type { PrepProgress } from "@/repositories/prepStateRepository"

/** Matches the SSE route's poll interval: refreshing faster than the server polls can't show anything new. */
export const REFRESH_INTERVAL_MS = 4_000

/** The counts that change what the page renders (pages, questions, concepts). Excludes `runState` and `totalPages`. */
export function contentSignature(p: PrepProgress | null): string {
  if (p === null) return ""
  return [ p.ocrPages, p.rejectedPages, p.hasConcepts, p.totalQuestions, p.completedQuestions, p.failedQuestions, p.terminalQuestions ].join(",")
}

/** Refresh when the content counts differ from the last refreshed ones, at most once per interval. A throttled change stays pending: the caller only advances `lastSignature` on refresh. */
export function shouldRefreshContent(lastSignature: string, next: PrepProgress, lastRefreshAt: number, now: number): boolean {
  if (contentSignature(next) === lastSignature) return false
  return now - lastRefreshAt >= REFRESH_INTERVAL_MS
}

/** DB-backed progress for a server run. Streams updates via SSE while a run is live and refreshes the page as content lands and when the run ends. */
export function useRunProgress(prepId: string, initial: PrepProgress | null, onError: (error: Error) => void) {
  const router = useRouter()
  const [ progress, setProgress ] = useState<PrepProgress | null>(initial)
  const [ watching, setWatching ] = useState(initial?.runState === "running")
  const seenRunning = useRef(initial?.runState === "running")
  const refreshedSignature = useRef(contentSignature(initial))
  const lastRefreshAt = useRef(0)

  const refreshContent = useCallback((signature: string) => {
    refreshedSignature.current = signature
    lastRefreshAt.current = Date.now()
    router.refresh()
  }, [ router ])

  useEffect(() => {
    if (!watching) return

    const source = new EventSource(`/api/preps/${prepId}/progress`)

    source.onmessage = (e) => {
      const next: PrepProgress = JSON.parse(e.data)
      setProgress(next)
      if (next.runState === "running") seenRunning.current = true
      if (shouldRefreshContent(refreshedSignature.current, next, lastRefreshAt.current, Date.now())) refreshContent(contentSignature(next))
    }

    source.addEventListener("done", () => {
      source.close()
      setWatching(false)
      if (seenRunning.current) {
        seenRunning.current = false
        router.refresh()
      }
    })

    source.onerror = () => {
      source.close()
      setWatching(false)
      onError(new Error("Progress stream interrupted"))
    }

    return () => source.close()
  }, [ watching, prepId, router, refreshContent, onError ])

  async function refresh() {
    setProgress(await getMyPrepProgress(prepId))
  }

  /** Call after the endpoint accepted a run: the job row may not exist yet. */
  function expectRun() {
    seenRunning.current = false
    setWatching(true)
  }

  return { progress, refresh, expectRun }
}
