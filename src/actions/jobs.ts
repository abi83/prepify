"use server"

import type { Prisma } from "@prisma/client"

import type { ExecutionConfig, Job, JobOutcome, JobStatus, QuestionSpec } from "@/core/job"
import type { AgentMeta } from "@/lib/agent"
import { requireUserId } from "@/lib/currentUser"
import { NotFoundError } from "@/repositories/errors"
import * as jobRepository from "@/repositories/jobRepository"
import type { PrepMetaResult } from "@/repositories/jobRepository"
import type { Concept } from "@/types/pipeline"
import type { OcrResult } from "@/types/prep"
import type { Difficulty } from "@/types/questions"

const store = jobRepository.createPrismaStore()

// ── `Store` port (src/core/ports.ts), one action per method, for the browser-side runner ──

export async function createJob(type: string, inputIds: string[], config: ExecutionConfig, question?: QuestionSpec): Promise<Job> {
  return store.createJob(await requireUserId(), type, inputIds, config, question)
}

export async function getJob(jobId: string): Promise<Job | null> {
  return store.getJob(await requireUserId(), jobId)
}

export async function existingIds(ids: string[]): Promise<string[]> {
  return [ ...await store.existingIds(await requireUserId(), ids) ]
}

export async function commitJob(jobId: string, fromStatus: JobStatus, outcome: JobOutcome<unknown>): Promise<boolean> {
  return store.commitJob(await requireUserId(), jobId, fromStatus, outcome)
}

export async function listUnfinishedJobs(prepId: string): Promise<Job[]> {
  return jobRepository.listUnfinishedJobs(await requireUserId(), prepId)
}

// ── Outcome writers called from a job's `run` ──

/** The repository writers skip ownership checks (they run after `runJob` authorized the job), so a browser-callable action must make it. */
async function assertOwnsJob(jobId: string): Promise<void> {
  const job = await store.getJob(await requireUserId(), jobId)
  if (!job) throw new NotFoundError(`Job ${jobId} not found`)
}

export async function recordOcrOutcome(jobId: string, imageId: string, result: OcrResult, meta: AgentMeta): Promise<void> {
  await assertOwnsJob(jobId)
  await jobRepository.recordOcrOutcome(jobId, imageId, result, meta)
}

export async function recordConceptsOutcome(jobId: string, concepts: Concept[], metas: AgentMeta[]): Promise<void> {
  await assertOwnsJob(jobId)
  await jobRepository.recordConceptsOutcome(jobId, concepts, metas)
}

export async function recordPrepMetaOutcome(jobId: string, conceptId: string, result: PrepMetaResult, metas: AgentMeta[]): Promise<void> {
  await assertOwnsJob(jobId)
  await jobRepository.recordPrepMetaOutcome(jobId, conceptId, result, metas)
}

export async function recordWastedCalls(jobId: string, metas: AgentMeta[]): Promise<void> {
  await assertOwnsJob(jobId)
  await jobRepository.recordWastedCalls(jobId, metas)
}

export async function recordQuestionOutcome(
  jobId: string,
  question: { type: string; difficulty: Difficulty; content: Prisma.InputJsonValue },
  metas: AgentMeta[],
): Promise<void> {
  await assertOwnsJob(jobId)
  await jobRepository.recordQuestionOutcome(jobId, question, metas)
}
