import type { ZodType } from "zod"

import type { AgentImage } from "@/lib/agent"
import type { SupportedLanguage } from "@/lib/config"
import type { PrepState } from "@/lib/planner"

import type { Job, JobOutcome, JobStatus, QuestionSpec } from "./job"
import type { Logger } from "./logger"
import type { Sampler } from "./sampler"

/**
 * Job persistence, actor-scoped — every method takes the acting user's id and is responsible
 * for its own ownership checks.
 */
export interface Store {
  getJob<TOutput = unknown>(actorId: string, jobId: string): Promise<Job<TOutput> | null>

  createJob<TOutput = unknown>(
    actorId: string,
    type: string,
    inputIds: string[],
    config: Job["config"],
    question?: QuestionSpec,
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

export type LlmContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; base64: string }

export interface LlmMessage {
  role: "system" | "user"
  content: string | LlmContentPart[]
}

/** Completion cap for an agent that sets no `maxTokens` of its own. */
export const DEFAULT_MAX_TOKENS = 32_000

export interface LlmRequest {
  model: string
  tier: string
  timeoutMs: number
  maxTokens: number
  messages: LlmMessage[]
  /** The completion must be JSON matching `schema`; `name` labels it for the provider. */
  responseFormat: { name: string; schema: ZodType }
}

export interface LlmResponse {
  content: string
  promptTokens: number
  cachedTokens: number
  completionTokens: number
  /** The sampling settings the call actually used — an `Llm` may override the request's. */
  temperature: number
  maxTokens: number
}

/** Thrown by an `Llm` when retrying the same request cannot succeed (bad request, bad key, forbidden). */
export class NonRetryableLlmError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = "NonRetryableLlmError"
  }
}

/** Structured-completion port — agents never construct a provider SDK client, so each runtime
 *  supplies its own adapter. Throws `NonRetryableLlmError` for failures that must not be retried. */
export interface Llm {
  complete(request: LlmRequest, signal: AbortSignal): Promise<LlmResponse>
}

export interface ProgressSink {
  report(update: { done: number; total: number }): void
}

/** The `PrepImage` fields jobs read. */
export interface PrepImageRef {
  id: string
  gcsKey: string
  ocrResult: unknown
  language: SupportedLanguage | null
}

/** The `Question` fields jobs read. */
export interface QuestionRef {
  id: string
  content: unknown
}

/** What a runtime fetches to build job inputs — the browser adapter wraps server actions. */
export interface PrepData {
  loadState(prepId: string): Promise<PrepState>
  listImages(prepId: string): Promise<PrepImageRef[]>
  loadQuestion(prepId: string, questionId: string): Promise<QuestionRef>
  downloadImage(prepId: string, gcsKey: string): Promise<AgentImage>
}

/** A prep's resumable (`created`/`failed`/`interrupted`) jobs, oldest first — what "resume" re-executes. Actor-scoped like `Store`. */
export type ListUnfinishedJobs = (actorId: string, prepId: string) => Promise<Job[]>

export interface Ports {
  store: Store
  llm: Llm
  logger: Logger
  sampler: Sampler
  progress: ProgressSink
  data: PrepData
}

/** What job definitions depend on. */
export type JobDeps = Pick<Ports, "llm" | "logger" | "sampler">

/** What agents depend on: the job's deps plus its per-request timeout. */
export type AgentDeps = JobDeps & { timeoutMs: number }
