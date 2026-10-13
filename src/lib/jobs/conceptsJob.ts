import type { JobRunResult } from "@/core/job"
import type { JobDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptExtractor } from "@/lib/agents/ConceptExtractor"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import type { SupportedLanguage } from "@/lib/config"
import { resolveLanguage } from "@/lib/language"
import { deduplicateExact } from "@/lib/mergeConceptLists"
import type { StoredConcept } from "@/types/pipeline"
import type { Page } from "@/types/prep"

import { CONCEPTS_JOB_TYPE } from "./jobTypes"

export type OcrPage = Page & { language: SupportedLanguage }

/** Pages up to `maxChars` of text in total; later pages are dropped. */
function truncatePages(pages: OcrPage[], maxChars: number): OcrPage[] {
  let charCount = 0
  return pages.filter(page => {
    if (charCount >= maxChars) return false
    charCount += page.text.length
    return true
  })
}

/**
 * One job per set of `PrepImage` ids — `inputIds` are those rows' ids. `pages` must already be
 * fetched by the caller (OCR text and language per page; all one language, else this throws);
 * this wraps the extractor → dedupe → merger chain (merger skipped on a single chunk) over
 * the first `maxChars` of text.
 */
export function createConceptsJobDefinition(allPages: OcrPage[], maxChars: number, deps: JobDeps): JobDefinition<StoredConcept[]> {
  const language = resolveLanguage(allPages)
  const pages = truncatePages(allPages, maxChars)
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
