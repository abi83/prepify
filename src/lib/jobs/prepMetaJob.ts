import type { PrepDiscipline } from "@prisma/client"

import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runPrepLabeler } from "@/lib/agents/PrepLabeler"
import { runPrepNamer } from "@/lib/agents/PrepNamer"
import { disciplineToEnum } from "@/lib/disciplineMapping"
import type { Logger } from "@/lib/logger"
import type { Sampler } from "@/lib/sampler/schema"
import * as jobRepository from "@/repositories/jobRepository"
import type { Concept } from "@/types/pipeline"

export const PREP_META_JOB_TYPE = "prep.meta"

export interface PrepMetaOutput {
  title: string
  description: string
  grade: number | null
  discipline: PrepDiscipline | null
}

/**
 * One job per set of `Concept` ids — `inputIds` are those rows' ids. `concepts` must already be
 * fetched by the caller; this wraps `PrepNamer` and `PrepLabeler` (the same agents
 * `pipeline.ts`/`ShareModal.tsx` already call) and writes title/description/grade/discipline
 * onto the target `Prep` row (resolved through the input concepts' `producedByJob`).
 */
export function createPrepMetaJobDefinition(concepts: Concept[], language: string, logger: Logger, sampler: Sampler): JobDefinition<PrepMetaOutput> {
  return {
    type: PREP_META_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<PrepMetaOutput> {
      const { model, tier } = ctx.job.config
      const [ conceptId ] = ctx.job.inputIds

      const [ named, labeled ] = await Promise.all([
        runPrepNamer(concepts, ctx.apiKey, model, tier, language, ctx.signal, logger, sampler),
        runPrepLabeler(concepts, ctx.apiKey, model, tier, ctx.signal, logger, sampler),
      ])

      const output: PrepMetaOutput = {
        title: named.output.title,
        description: named.output.description,
        grade: labeled.output.grade,
        discipline: disciplineToEnum(labeled.output.discipline),
      }

      await jobRepository.recordPrepMetaOutcome(ctx.job.id, conceptId, output, [ named.meta, labeled.meta ])
      return output
    },
  }
}
