import type { JobRunResult } from "@/core/job"
import type { JobDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import type { SupportedLanguage } from "@/lib/config"
import { deduplicateExact } from "@/lib/mergeConceptLists"
import type { StoredConcept } from "@/types/pipeline"
import type { Page } from "@/types/prep"

import { CONCEPTS_JOB_TYPE } from "./jobTypes"

/**
 * One job per set of `PrepImage` ids — `inputIds` are those rows' ids. `pages` must already be
 * fetched by the caller (OCR text per page); this wraps the extractor → dedupe → merger chain
 * (merger skipped on a single chunk).
 */
export function createConceptsJobDefinition(pages: Page[], language: SupportedLanguage, deps: JobDeps): JobDefinition<StoredConcept[]> {
  return {
    type: CONCEPTS_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<StoredConcept[]>> {
      const { model, tier, timeoutMs } = ctx.job.config
      const agentDeps = { ...deps, timeoutMs }

      const extracted = await runConceptExtractor(pages, model, tier, language, ctx.signal, agentDeps)
      const deduped = deduplicateExact(extracted.output)

      const metas = [ ...extracted.metas ]
      let concepts = deduped
      if (extracted.chunkCount > 1) {
        const merged = await runConceptMerger(deduped, model, tier, language, ctx.signal, agentDeps)
        metas.push(merged.meta)
        concepts = merged.output
      }

      return { output: concepts.map(concept => ({ ...concept, language })), metas, wastedMetas: [] }
    },
  }
}
