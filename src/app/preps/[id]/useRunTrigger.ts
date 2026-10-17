import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useRef, useState } from "react"

import type { GenerationConfig } from "@/core/lib/generationConfig"
import { getApiKey, type ApiKeyConfig } from "@/lib/apiKey"
import { getExecutionMode, isExecutionModeSet } from "@/lib/executionMode"
import { awaitRunStart, requestServerRun } from "@/lib/jobs/client/serverRunClient"

export interface RunRequest {
  config: GenerationConfig
  /** Runs before a server run is requested. */
  beforeServerRun: () => Promise<void>
  /** The browser-mode run; throws to report a failure. */
  runInBrowser: (run: { actorId: string; keyConfig: ApiKeyConfig }) => Promise<void>
}

interface Handlers {
  onError: (message: string) => void
  /** After a successful run, once the page is refreshed. */
  onFinished: () => void
  /** The server accepted a run, before the page refreshes: start watching its progress. */
  onServerRunStarted: () => void
}

/** Starts a run: execution mode → key/session checks → browser or server run → refresh. */
export function useRunTrigger(prepId: string, { onError, onFinished, onServerRunStarted }: Handlers) {
  const router = useRouter()
  const { data: session } = useSession()
  const pendingRef = useRef<RunRequest | null>(null)
  const [ modeDialogOpen, setModeDialogOpen ] = useState(false)

  async function runOnServer(request: RunRequest, keyConfig: ApiKeyConfig) {
    await request.beforeServerRun()
    await requestServerRun({ apiKey: keyConfig.key, prepId, model: keyConfig.model, tier: keyConfig.tier, target: request.config })
    onServerRunStarted()
    await awaitRunStart(prepId)
  }

  async function execute(request: RunRequest) {
    try {
      const keyConfig = getApiKey()
      if (!keyConfig) throw new Error("No API key configured. Please set one in Settings.")
      const actorId = session?.user.id
      if (!actorId) throw new Error("You are not signed in.")

      if (getExecutionMode() === "server") await runOnServer(request, keyConfig)
      else await request.runInBrowser({ actorId, keyConfig })
    } catch (e) {
      onError(e instanceof Error ? e.message : "The run failed")
      return
    }
    router.refresh()
    onFinished()
  }

  function run(request: RunRequest) {
    if (!isExecutionModeSet()) {
      pendingRef.current = request
      setModeDialogOpen(true)
      return
    }
    void execute(request)
  }

  function confirmMode() {
    setModeDialogOpen(false)
    const request = pendingRef.current
    pendingRef.current = null
    if (request) void execute(request)
  }

  return { run, modeDialogOpen, confirmMode }
}
