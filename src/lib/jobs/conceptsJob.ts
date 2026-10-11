import * as jobActions from "@/actions/jobs"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import type { Logger } from "@/lib/logger"
import { deduplicateExact } from "@/lib/mergeConceptLists"
import type { Sampler } from "@/lib/sampler/schema"
import type { Concept } from "@/types/pipeline"
import type { Page } from "@/types/prep"

import { CONCEPTS_JOB_TYPE } from "./jobTypes"

/**
 * One job per set of `PrepImage` ids — `inputIds` are those rows' ids. `pages` must already be
 * fetched by the caller (OCR text per page); this wraps the extractor → dedupe → merger chain
 * (merger skipped on a single chunk) and the write of the resulting `Concept` rows.
 */
export function createConceptsJobDefinition(pages: Page[], language: string, logger: Logger, sampler: Sampler): JobDefinition<Concept[]> {
  return {
    type: CONCEPTS_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<Concept[]> {
      const { model, tier } = ctx.job.config

      const extracted = await runConceptExtractor(pages, ctx.apiKey, model, tier, language, ctx.signal, logger, sampler)
      const deduped = deduplicateExact(extracted.output)

      const metas = [ ...extracted.metas ]
      let concepts = deduped
      if (extracted.chunkCount > 1) {
        const merged = await runConceptMerger(deduped, ctx.apiKey, model, tier, language, ctx.signal, logger, sampler)
        metas.push(merged.meta)
        concepts = merged.output
      }

      await jobActions.recordConceptsOutcome(ctx.job.id, concepts, metas)
      return concepts
    },
  }
}
