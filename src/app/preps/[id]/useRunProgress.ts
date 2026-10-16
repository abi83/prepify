"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { getMyPrepProgress } from "@/actions/prepState"
import type { PrepProgress } from "@/repositories/prepStateRepository"

/** DB-backed progress for a server run. Streams updates via SSE while a run is live and refreshes the page when it ends. */
export function useRunProgress(prepId: string, initial: PrepProgress | null, onError: (error: Error) => void) {
  const router = useRouter()
  const [ progress, setProgress ] = useState<PrepProgress | null>(initial)
  const [ watching, setWatching ] = useState(initial?.runState === "running")
  const seenRunning = useRef(initial?.runState === "running")

  useEffect(() => {
    if (!watching) return

    const source = new EventSource(`/api/preps/${prepId}/progress`)

    source.onmessage = (e) => {
      const next: PrepProgress = JSON.parse(e.data)
      setProgress(next)
      if (next.runState === "running") seenRunning.current = true
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
  }, [ watching, prepId, router, onError ])

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
