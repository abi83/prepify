import type { JobRunResult } from "@/core/job"
import type { JobDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runPrepLabeler } from "@/lib/agents/PrepLabeler"
import { runPrepNamer } from "@/lib/agents/PrepNamer"
import { disciplineToEnum } from "@/lib/disciplineMapping"
import { resolveLanguage } from "@/lib/language"
import type { StoredConcept } from "@/types/pipeline"
import type { PrepDisciplineId } from "@/types/prep"

import { PREP_META_JOB_TYPE } from "./jobTypes"

export interface PrepMetaOutput {
  title: string
  description: string
  grade: number | null
  discipline: PrepDisciplineId | null
}

/**
 * One job per set of `Concept` ids — `inputIds` are those rows' ids. `concepts` must already be
 * fetched by the caller; this wraps `PrepNamer` and `PrepLabeler` (the same agents
 * `ShareModal.tsx` calls).
 */
export function createPrepMetaJobDefinition(concepts: StoredConcept[], deps: JobDeps): JobDefinition<PrepMetaOutput> {
  const language = resolveLanguage(concepts)
  return {
    type: PREP_META_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<PrepMetaOutput>> {
      const { model, tier, timeoutMs } = ctx.job.config
      const agentDeps = { ...deps, timeoutMs }

      const [ named, labeled ] = await Promise.all([
        runPrepNamer(concepts, model, tier, language, ctx.signal, agentDeps),
        runPrepLabeler(concepts, model, tier, ctx.signal, agentDeps),
      ])

      const output: PrepMetaOutput = {
        title: named.output.title,
        description: named.output.description,
        grade: labeled.output.grade,
        discipline: disciplineToEnum(labeled.output.discipline),
      }

      return { output, metas: [ named.meta, labeled.meta ], wastedMetas: [] }
    },
  }
}
