"use server"

import type { ExecutionConfig, Job, JobOutcome, JobStatus, QuestionSpec } from "@/core/job"
import { requireUserId } from "@/lib/currentUser"
import * as jobRepository from "@/repositories/jobRepository"

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

export async function retryTerminalJobs(prepId: string): Promise<number> {
  return jobRepository.retryTerminalJobs(await requireUserId(), prepId)
}

export async function listUnfinishedJobs(prepId: string): Promise<Job[]> {
  return jobRepository.listUnfinishedJobs(await requireUserId(), prepId)
}
