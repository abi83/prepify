import { pageConceptsSchema, type PageConcepts } from "@/types/pipeline"
import type { PageMergeState } from "@/types/prepState"

/** Each image's extraction outcome from its executed `concepts.extract` jobs (the latest wins). */
export function indexPageConcepts(jobs: { inputIds: string[]; output: unknown }[]): Map<string, PageConcepts> {
  return new Map(jobs.map(job => [ job.inputIds[0], pageConceptsSchema.parse(job.output) ]))
}

/** Each image's merge state from its `concepts` jobs; a job that covers several images (one run before per-page merges) counts for each. */
export function indexMerges(jobs: { status: string; inputIds: string[] }[]): Map<string, PageMergeState> {
  const merges = new Map<string, PageMergeState>()
  for (const job of jobs) {
    for (const id of job.inputIds) {
      if (merges.get(id) !== "merged") merges.set(id, job.status === "executed" ? "merged" : "planned")
    }
  }
  return merges
}
