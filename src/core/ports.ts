import type { Job, JobOutcome, JobStatus } from "./job"

/**
 * Job persistence, actor-scoped like `assertOwnsRun(userId, ...)` in
 * `pipelineRepository.ts` — every method takes the acting user's id and is responsible for
 * its own ownership checks.
 */
export interface Store {
  getJob<TOutput = unknown>(actorId: string, jobId: string): Promise<Job<TOutput> | null>

  createJob<TOutput = unknown>(
    actorId: string,
    type: string,
    inputIds: string[],
    config: Job["config"],
  ): Promise<Job<TOutput>>

  /** Returns the subset of `ids` that exist and are resolvable by this actor — used to
   *  verify a job's declared `inputIds` before it runs. */
  existingIds(actorId: string, ids: string[]): Promise<Set<string>>

  /**
   * Conditionally transitions a job out of `fromStatus` and commits `outcome` in one step.
   * Returns `false` if the job was no longer `fromStatus` by the time this call lands — the
   * loser of a concurrent race on the same job — in which case the caller must discard
   * `outcome` rather than retry the commit.
   */
  commitJob<TOutput>(
    actorId: string,
    jobId: string,
    fromStatus: JobStatus,
    outcome: JobOutcome<TOutput>,
  ): Promise<boolean>
}

export interface LlmMessage {
  role: "system" | "user"
  content: string
}

export interface LlmRequest {
  apiKey: string
  model: string
  tier: string
  timeoutMs: number
  messages: LlmMessage[]
}

export interface LlmResponse {
  content: string
  promptTokens: number
  cachedTokens: number
  completionTokens: number
}

/** OpenAI-compatible completion port — replaces the direct `new OpenAI(...)` construction
 *  in `src/lib/agent.ts`, so job `run` implementations never import the `openai` SDK directly. */
export interface Llm {
  complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse>
}

export interface ProgressSink {
  report(update: { done: number; total: number }): void
}
