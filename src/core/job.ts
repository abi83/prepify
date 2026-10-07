/**
 * The job contract: no Next, React, Prisma, or `src/actions/*` imports anywhere under
 * `src/core/` — this module must stay usable from a browser worker, a server, or a CLI.
 */

export type JobStatus = "created" | "executed" | "failed"

/** Model, tier, timeout, and retry count for one job's execution — fully resolved by the
 *  caller (merging UI input over defaults is the caller's job, not core's). Never carries
 *  an API key: that's supplied only at execution, never stored. */
export interface ExecutionConfig {
  model: string
  tier: string
  timeoutMs: number
  maxRetries: number
}

/** `created` is re-executable; `failed` is re-executable (retry); `executed` is terminal.
 *  A discriminated union so only `executed` carries `output` and only `failed` carries
 *  `failureReason` — no reachable state where either is present on the wrong status. */
export type Job<TOutput = unknown> =
  | { id: string; type: string; status: "created"; inputIds: string[]; config: ExecutionConfig; output: null; failureReason: null }
  | { id: string; type: string; status: "executed"; inputIds: string[]; config: ExecutionConfig; output: TOutput; failureReason: null }
  | { id: string; type: string; status: "failed"; inputIds: string[]; config: ExecutionConfig; output: null; failureReason: string }

/** The result `runJob` commits to the `Store` once a job finishes running. */
export type JobOutcome<TOutput> =
  | { status: "executed"; output: TOutput }
  | { status: "failed"; failureReason: string }
