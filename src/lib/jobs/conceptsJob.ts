import type { JobRunResult } from "@/core/job"
import type { JobDeps } from "@/core/ports"
import { JobRunError, type JobDefinition, type JobRunContext } from "@/core/runJob"
import type { AgentMeta } from "@/lib/agent"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import { resolveLanguage } from "@/lib/language"
import { deduplicateExact } from "@/lib/mergeConceptLists"
import type { StoredConcept } from "@/types/pipeline"

import { CONCEPTS_JOB_TYPE } from "./jobTypes"

/**
 * One job per prep — `inputIds` are the `PrepImage` ids that yielded concepts. `pages` holds
 * each one's extracted concepts (all one language, else this throws); this dedupes them and
 * runs the merger across pages (skipped when only one page has concepts).
 */
export function createConceptsJobDefinition(pages: StoredConcept[][], deps: JobDeps): JobDefinition<StoredConcept[]> {
  const language = resolveLanguage(pages.flat())
  return {
    type: CONCEPTS_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<StoredConcept[]>> {
      const { model, tier, timeoutMs } = ctx.job.config
      const deduped = deduplicateExact(pages.flat())

      const metas: AgentMeta[] = []
      let concepts = deduped
      if (pages.length > 1) {
        const merged = await runConceptMerger(deduped, model, tier, language, ctx.signal, { ...deps, timeoutMs })
        metas.push(merged.meta)
        concepts = merged.output
      }
      if (concepts.length === 0) throw new JobRunError(metas, new Error("Concept merge produced no concepts"))

      return { output: concepts.map(concept => ({ ...concept, language })), metas, wastedMetas: [] }
    },
  }
}
