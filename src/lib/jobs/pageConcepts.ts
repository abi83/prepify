import { pageConceptsSchema, type PageConcepts } from "@/types/pipeline"

/** Each image's extraction outcome from its executed `concepts.extract` jobs (the latest wins). */
export function indexPageConcepts(jobs: { inputIds: string[]; output: unknown }[]): Map<string, PageConcepts> {
  return new Map(jobs.map(job => [ job.inputIds[0], pageConceptsSchema.parse(job.output) ]))
}
