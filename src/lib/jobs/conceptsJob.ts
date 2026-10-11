import type { JobRunResult } from "@/core/job"
import type { AgentDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import { deduplicateExact } from "@/lib/mergeConceptLists"
import type { Concept } from "@/types/pipeline"
import type { Page } from "@/types/prep"

import { CONCEPTS_JOB_TYPE } from "./jobTypes"

/**
 * One job per set of `PrepImage` ids — `inputIds` are those rows' ids. `pages` must already be
 * fetched by the caller (OCR text per page); this wraps the extractor → dedupe → merger chain
 * (merger skipped on a single chunk).
 */
export function createConceptsJobDefinition(pages: Page[], language: string, deps: AgentDeps): JobDefinition<Concept[]> {
  return {
    type: CONCEPTS_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<Concept[]>> {
      const { model, tier } = ctx.job.config

      const extracted = await runConceptExtractor(pages, model, tier, language, ctx.signal, deps)
      const deduped = deduplicateExact(extracted.output)

      const metas = [ ...extracted.metas ]
      let concepts = deduped
      if (extracted.chunkCount > 1) {
        const merged = await runConceptMerger(deduped, model, tier, language, ctx.signal, deps)
        metas.push(merged.meta)
        concepts = merged.output
      }

      return { output: concepts, metas, wastedMetas: [] }
    },
  }
}
