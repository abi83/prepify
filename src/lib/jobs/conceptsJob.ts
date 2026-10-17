import type { JobRunResult } from "@/core/job"
import { CONCEPTS_JOB_TYPE } from "@/core/lib/jobs/jobTypes"
import { resolveLanguage } from "@/core/lib/language"
import type { JobDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runConceptMerger } from "@/lib/agents/ConceptMerger"
import type { StoredConcept } from "@/types/pipeline"

/**
 * One job per page — `inputIds[0]` is the `PrepImage` id. `incoming` holds that page's extracted
 * concepts, `stored` the prep's concepts so far (all one language, else this throws). The output is
 * only the incoming concepts the prep doesn't have yet; stored concepts are never touched.
 */
export function createConceptsJobDefinition(incoming: StoredConcept[], stored: (StoredConcept & { id: string })[], deps: JobDeps): JobDefinition<StoredConcept[]> {
  const language = resolveLanguage([ ...incoming, ...stored ])
  return {
    type: CONCEPTS_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<StoredConcept[]>> {
      if (stored.length === 0) return { output: incoming, metas: [], wastedMetas: [] }

      const { model, tier, timeoutMs } = ctx.job.config
      const { output, meta } = await runConceptMerger(incoming, stored, model, tier, ctx.signal, { ...deps, timeoutMs })
      const added = output.filter(verdict => verdict.duplicateOfId === null).map(({ concept }) => ({ ...concept, language }))
      return { output: added, metas: [ meta ], wastedMetas: [] }
    },
  }
}
