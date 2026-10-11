import type { PrepDiscipline } from "@prisma/client"

import * as jobActions from "@/actions/jobs"
import type { AgentDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runPrepLabeler } from "@/lib/agents/PrepLabeler"
import { runPrepNamer } from "@/lib/agents/PrepNamer"
import { disciplineToEnum } from "@/lib/disciplineMapping"
import type { Concept } from "@/types/pipeline"

import { PREP_META_JOB_TYPE } from "./jobTypes"

export interface PrepMetaOutput {
  title: string
  description: string
  grade: number | null
  discipline: PrepDiscipline | null
}

/**
 * One job per set of `Concept` ids — `inputIds` are those rows' ids. `concepts` must already be
 * fetched by the caller; this wraps `PrepNamer` and `PrepLabeler` (the same agents
 * `ShareModal.tsx` calls) and writes title/description/grade/discipline
 * onto the target `Prep` row (resolved through the input concepts' `producedByJob`).
 */
export function createPrepMetaJobDefinition(concepts: Concept[], language: string, deps: AgentDeps): JobDefinition<PrepMetaOutput> {
  return {
    type: PREP_META_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<PrepMetaOutput> {
      const { model, tier } = ctx.job.config
      const [ conceptId ] = ctx.job.inputIds

      const [ named, labeled ] = await Promise.all([
        runPrepNamer(concepts, model, tier, language, ctx.signal, deps),
        runPrepLabeler(concepts, model, tier, ctx.signal, deps),
      ])

      const output: PrepMetaOutput = {
        title: named.output.title,
        description: named.output.description,
        grade: labeled.output.grade,
        discipline: disciplineToEnum(labeled.output.discipline),
      }

      await jobActions.recordPrepMetaOutcome(ctx.job.id, conceptId, output, [ named.meta, labeled.meta ])
      return output
    },
  }
}
