/**
 * The job contract: no Next, React, Prisma, or `src/actions/*` imports anywhere under
 * `src/core/` — this module must stay usable from a browser worker, a server, or a CLI.
 */

import type { AgentMeta } from "@/lib/agent"

export type JobStatus = "created" | "running" | "interrupted" | "executed" | "failed"

/** Statuses of a job with no outcome yet. `running` has a live runner; `interrupted` lost it. */
export type PendingJobStatus = "created" | "running" | "interrupted"

/** Model, tier, timeout, and retry count for one job's execution — fully resolved by the
 *  caller (merging UI input over defaults is the caller's job, not core's). Never carries
 *  an API key: that's supplied only at execution, never stored. */
export interface ExecutionConfig {
  model: string
  tier: string
  timeoutMs: number
  maxRetries: number
}

/** What a `question` job builds — a task's type/difficulty aren't entities, so they can't be
 *  `inputIds`. Null on every other job type. */
export interface QuestionSpec {
  questionType: string
  difficulty: string
}

/** `created`, `interrupted` and `failed` are re-executable; `running` belongs to a live runner; `executed` is terminal.
 *  A discriminated union so only `executed` carries `output` and only `failed` carries
 *  `failureReason` — no reachable state where either is present on the wrong status. */
export type Job<TOutput = unknown> =
  | { id: string; type: string; status: PendingJobStatus; inputIds: string[]; config: ExecutionConfig; question: QuestionSpec | null; output: null; failureReason: null }
  | { id: string; type: string; status: "executed"; inputIds: string[]; config: ExecutionConfig; question: QuestionSpec | null; output: TOutput; failureReason: null }
  | { id: string; type: string; status: "failed"; inputIds: string[]; config: ExecutionConfig; question: QuestionSpec | null; output: null; failureReason: string }

/** What a job's `run` returns: its output plus the LLM calls behind it. `wastedMetas` are
 *  calls whose result was discarded (rejected attempts). */
export interface JobRunResult<TOutput> {
  output: TOutput
  metas: AgentMeta[]
  wastedMetas: AgentMeta[]
}

/** The result `runJob` commits to the `Store` once a job finishes running; the `Store`
 *  persists the output's domain rows and the metas together with the status change. */
export type JobOutcome<TOutput> =
  | { status: "executed"; output: TOutput; metas: AgentMeta[]; wastedMetas: AgentMeta[] }
  | { status: "failed"; failureReason: string; wastedMetas: AgentMeta[] }
