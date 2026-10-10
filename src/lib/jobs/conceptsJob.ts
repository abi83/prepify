import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import type { Logger } from "@/lib/logger"
import { deduplicateExact } from "@/lib/mergeConceptLists"
import type { Sampler } from "@/lib/sampler/schema"
import * as jobRepository from "@/repositories/jobRepository"
import type { Concept } from "@/types/pipeline"
import type { Page } from "@/types/prep"

export const CONCEPTS_JOB_TYPE = "concepts"

/**
 * One job per set of `PrepImage` ids — `inputIds` are those rows' ids. `pages` must already be
 * fetched by the caller (OCR text per page); this only wraps the extractor → dedupe → merger
 * chain `pipeline.ts` already runs (merger skipped on a single chunk, same condition), and the
 * write of the resulting `Concept` rows. Wiring this into the live pipeline is #273.
 */
export function createConceptsJobDefinition(pages: Page[], language: string, logger: Logger, sampler: Sampler): JobDefinition<Concept[]> {
  return {
    type: CONCEPTS_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<Concept[]> {
      const { model, tier } = ctx.job.config
      const [ imageId ] = ctx.job.inputIds

      const extracted = await runConceptExtractor(pages, ctx.apiKey, model, tier, language, ctx.signal, logger, sampler)
      const deduped = deduplicateExact(extracted.output)

      const metas = [ ...extracted.metas ]
      let concepts = deduped
      if (extracted.chunkCount > 1) {
        const merged = await runConceptMerger(deduped, ctx.apiKey, model, tier, language, ctx.signal, logger, sampler)
        metas.push(merged.meta)
        concepts = merged.output
      }

      await jobRepository.recordConceptsOutcome(ctx.job.id, imageId, concepts, metas)
      return concepts
    },
  }
}
