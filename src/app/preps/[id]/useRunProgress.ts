"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { getMyPrepProgress } from "@/actions/prepState"
import type { PrepProgress } from "@/repositories/prepStateRepository"

export const POLL_INTERVAL_MS = 5_000
/** Idle polls tolerated after a trigger, before the first job row is claimed. */
const START_GRACE_POLLS = 3

/** DB-backed progress for a server run. Polls while one is live and refreshes the page when it ends. */
export function useRunProgress(prepId: string, initial: PrepProgress | null, onError: (error: Error) => void) {
  const router = useRouter()
  const [ progress, setProgress ] = useState<PrepProgress | null>(initial)
  const [ awaitingStart, setAwaitingStart ] = useState(false)
  const seenRunning = useRef(initial?.runState === "running")
  const idlePolls = useRef(0)
  const polling = progress?.runState === "running" || awaitingStart

  useEffect(() => {
    if (!polling) return
    const timer = setInterval(async () => {
      try {
        const next = await getMyPrepProgress(prepId)
        setProgress(next)
        if (next?.runState === "running") {
          seenRunning.current = true
          setAwaitingStart(false)
          return
        }
        if (seenRunning.current) {
          seenRunning.current = false
          setAwaitingStart(false)
          router.refresh()
          return
        }
        idlePolls.current += 1
        if (idlePolls.current >= START_GRACE_POLLS) setAwaitingStart(false)
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ polling, prepId, router, onError ])

  async function refresh() {
    setProgress(await getMyPrepProgress(prepId))
  }

  /** Call after the endpoint accepted a run: the job row may not exist yet. */
  function expectRun() {
    idlePolls.current = 0
    setAwaitingStart(true)
  }

  return { progress, refresh, expectRun }
}
