import type { JobStatus } from "@/core/job"
import { CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE } from "@/types/jobTypes"
import type { PrepStatus } from "@/types/prep"

/** Jobs whose terminal failure leaves the prep unusable; a failed question or asset job doesn't. */
const PIPELINE_BLOCKING_TYPES: ReadonlySet<string> = new Set([
  OCR_JOB_TYPE, PREP_META_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE,
])

export interface StatusJob {
  type: string
  status: JobStatus
  attempts: number
}

/** A prep's status from its jobs; `superseded` ones don't count. Mirrored by the backfill in the `prep_status` migration. */
export function derivePrepStatus(allJobs: StatusJob[], maxAttempts: number): PrepStatus {
  const jobs = allJobs.filter(job => job.status !== "superseded")
  if (jobs.length === 0) return "draft"
  const isTerminal = (job: StatusJob) => job.status === "failed" && job.attempts >= maxAttempts

  if (jobs.some(job => isTerminal(job) && PIPELINE_BLOCKING_TYPES.has(job.type))) return "failed"
  if (jobs.some(job => job.status !== "executed" && !isTerminal(job))) return "processing"
  return "ready"
}
