import type { JobRunResult } from "@/core/job"
import { CONCEPTS_EXTRACT_JOB_TYPE } from "@/core/lib/jobs/jobTypes"
import type { JobDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import type { PageConcepts } from "@/types/pipeline"
import type { Page } from "@/types/prep"

/**
 * One job per `PrepImage` row — `inputIds[0]` is that row's id. `page` must already be
 * fetched by the caller (OCR text and language); this wraps `ConceptExtractor`. The output is
 * kept on the job only: the `concepts` job turns the pages' outputs into `Concept` rows.
 */
export function createConceptsExtractJobDefinition(page: Page, deps: JobDeps): JobDefinition<PageConcepts> {
  return {
    type: CONCEPTS_EXTRACT_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<PageConcepts>> {
      const { model, tier, timeoutMs } = ctx.job.config
      const { output, meta } = await runConceptExtractor(page, model, tier, page.language, ctx.signal, { ...deps, timeoutMs })
      return { output, metas: [ meta ], wastedMetas: [] }
    },
  }
}
