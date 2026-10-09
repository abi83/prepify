import { describe, expect, it } from "vitest"

import { createInMemoryStore } from "@/core/inMemoryStore"
import type { ExecutionConfig } from "@/core/job"
import type { Llm, ProgressSink } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { MissingDependencyError, runJob } from "@/core/runJob"

const CONFIG: ExecutionConfig = { model: "gpt-5-nano", tier: "flex", timeoutMs: 1000, maxRetries: 0 }

const NOOP_LLM: Llm = {
  complete: () => {
    throw new Error("not used in this test")
  },
}
const NOOP_PROGRESS: ProgressSink = { report: () => {} }

function ports(overrides: Partial<{ llm: Llm; progress: ProgressSink }> = {}) {
  return {
    store: createInMemoryStore(),
    llm: overrides.llm ?? NOOP_LLM,
    progress: overrides.progress ?? NOOP_PROGRESS,
  }
}

function succeeding<TOutput>(type: string, output: TOutput): JobDefinition<TOutput> {
  return { type, run: async () => output }
}

function abortError(): Error {
  const err = new Error("aborted")
  err.name = "AbortError"
  return err
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(abortError())
    }, { once: true })
  })
}

describe("runJob", () => {
  it("throws MissingDependencyError when a declared inputId doesn't resolve, and leaves the job untouched", async () => {
    const { store, llm, progress } = ports()
    const job = await store.createJob("user-1", "greet", [ "concept-missing" ], CONFIG)

    await expect(
      runJob(succeeding("greet", "hi"), { store, llm, progress }, { actorId: "user-1", jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal })
    ).rejects.toThrow(MissingDependencyError)

    expect(await store.getJob("user-1", job.id)).toMatchObject({ status: "created" })
  })

  it("sets status to failed(reason) when run throws, and the job is re-executable afterwards", async () => {
    const { store, llm, progress } = ports()
    const job = await store.createJob("user-1", "greet", [], CONFIG)
    const failing: JobDefinition<string> = {
      type: "greet",
      run: async () => { throw new Error("boom") },
    }

    const result = await runJob(failing, { store, llm, progress }, { actorId: "user-1", jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal })

    expect(result).toEqual({ committed: true, status: "failed", failureReason: "boom" })
    expect(await store.getJob("user-1", job.id)).toMatchObject({ status: "failed", failureReason: "boom", output: null })

    // Retry: a failed job is re-executable, with no separate retry path.
    const retryResult = await runJob(succeeding("greet", "hi"), { store, llm, progress }, { actorId: "user-1", jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal })

    expect(retryResult).toEqual({ committed: true, status: "executed", output: "hi" })
    expect(await store.getJob("user-1", job.id)).toMatchObject({ status: "executed", output: "hi", failureReason: null })
  })

  it("propagates cancellation via AbortSignal without committing anything", async () => {
    const { store, llm, progress } = ports()
    const job = await store.createJob("user-1", "slow", [], CONFIG)
    const slow: JobDefinition<string> = {
      type: "slow",
      run: async (ctx: JobRunContext) => {
        await abortableDelay(10_000, ctx.signal)
        return "done"
      },
    }

    const controller = new AbortController()
    const promise = runJob(slow, { store, llm, progress }, { actorId: "user-1", jobId: job.id, apiKey: "sk-test", signal: controller.signal })
    controller.abort()

    await expect(promise).rejects.toMatchObject({ name: "AbortError" })
    expect(await store.getJob("user-1", job.id)).toMatchObject({ status: "created" })
  })

  it("commits only the winner of a concurrent race on the same job; the loser discards its output", async () => {
    const { store, llm, progress } = ports()
    const job = await store.createJob("user-1", "greet", [], CONFIG)

    const [ first, second ] = await Promise.all([
      runJob(succeeding("greet", "A"), { store, llm, progress }, { actorId: "user-1", jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal }),
      runJob(succeeding("greet", "B"), { store, llm, progress }, { actorId: "user-1", jobId: job.id, apiKey: "sk-test", signal: new AbortController().signal }),
    ])

    const committed = [ first, second ].filter(r => r.committed)
    const discarded = [ first, second ].filter(r => !r.committed)
    expect(committed).toHaveLength(1)
    expect(discarded).toHaveLength(1)
    expect(discarded[0]).toEqual({ committed: false })

    const finalJob = await store.getJob("user-1", job.id)
    expect(finalJob?.status).toBe("executed")
    expect(committed[0]).toEqual({ committed: true, status: "executed", output: (finalJob as { output: string }).output })
  })
})
