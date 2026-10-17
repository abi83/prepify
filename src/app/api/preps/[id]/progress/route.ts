import { auth } from "@/lib/auth"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import { interruptStaleJobs } from "@/repositories/jobRepository"
import * as prepRepository from "@/repositories/prepRepository"
import * as prepStateRepository from "@/repositories/prepStateRepository"

// Must match Cloud Run request timeout — SSE stream stays open for the duration of a run.
export const maxDuration = 3600

const POLL_MS = 4_000
/** Polls before seeing a running job before giving up (~16 s grace after trigger). */
const GRACE_POLLS = 4
/** How often an open stream flips dead-heartbeat `running` jobs to `interrupted`. */
const SWEEP_MS = 30_000

/** Streams progress until the run finishes or the grace period expires, then sends `done` once so EventSource doesn't reconnect. */
async function streamProgress(prepId: string, send: (chunk: string) => void, isCancelled: () => boolean) {
  let seenRunning = false
  let idlePolls = 0
  let lastSweep = 0

  while (!isCancelled()) {
    if (Date.now() - lastSweep >= SWEEP_MS) {
      await interruptStaleJobs({ prepId })
      lastSweep = Date.now()
    }
    const progress = await prepStateRepository.getPrepProgress(prepId)
    if (progress) send(`data: ${JSON.stringify(progress)}\n\n`)

    if (progress?.runState === "running") {
      seenRunning = true
      idlePolls = 0
    } else {
      if (seenRunning) break
      idlePolls++
    }
    if (idlePolls >= GRACE_POLLS) break

    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS))
  }

  send("event: done\ndata: {}\n\n")
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const userId = session?.user.id
  if (!userId) return new Response("Not authenticated", { status: 401 })

  const { id: prepId } = await params

  try {
    const prep = await prepRepository.getPrep(userId, prepId)
    if (prep.userId !== userId) return new Response("Forbidden", { status: 403 })
  } catch (e) {
    if (e instanceof NotFoundError) return new Response("Not found", { status: 404 })
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403 })
    throw e
  }

  const encoder = new TextEncoder()
  let cancelled = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        if (!cancelled) controller.enqueue(encoder.encode(chunk))
      }
      try {
        await streamProgress(prepId, send, () => cancelled)
      } catch (e) {
        if (!cancelled) controller.error(e)
        return
      }
      if (!cancelled) controller.close()
    },
    cancel() {
      cancelled = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
