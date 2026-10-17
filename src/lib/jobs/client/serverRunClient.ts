import { getMyPrepProgress } from "@/actions/prepState"
import type { ServerRunRequest } from "@/core/lib/serverRunRequest"

export type ServerRunOutcome = "triggered" | "already_running"

const FAILURES: Record<number, string> = {
  400: "The server rejected the generation request.",
  401: "You are signed out. Sign in again.",
  403: "You don't own this prep.",
  404: "Prep not found.",
}

/** Starts (or resumes) a server-side run. 409 is not an error: a run is already live, so the caller just watches it. */
export async function requestServerRun(request: Pick<ServerRunRequest, "apiKey" | "prepId" | "model" | "tier" | "target">): Promise<ServerRunOutcome> {
  const response = await fetch("/api/preps/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  if (response.status === 202) return "triggered"
  if (response.status === 409) return "already_running"
  throw new Error(FAILURES[response.status] ?? `Unexpected response (${response.status}).`)
}

const START_POLL_MS = 500
const START_POLL_ATTEMPTS = 20

/** Waits for the triggered run's first job row, so the prep page's first render already shows progress. If it never appears, the page's own polling takes over. */
export async function awaitRunStart(prepId: string): Promise<void> {
  for (let attempt = 0; attempt < START_POLL_ATTEMPTS; attempt++) {
    if (await getMyPrepProgress(prepId)) return
    await new Promise(resolve => setTimeout(resolve, START_POLL_MS))
  }
}
