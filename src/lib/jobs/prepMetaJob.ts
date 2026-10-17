import type { JobRunResult } from "@/core/job"
import { PREP_META_JOB_TYPE } from "@/core/lib/jobs/jobTypes"
import { resolveLanguage } from "@/core/lib/language"
import type { JobDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { runPrepMeta } from "@/lib/agents/PrepMeta"
import { disciplineToEnum } from "@/lib/disciplineMapping"
import type { Page, PrepDisciplineId } from "@/types/prep"

export interface PrepMetaOutput {
  title: string
  description: string
  grade: number | null
  discipline: PrepDisciplineId | null
}

/**
 * One job per prep — `inputIds` are the `PrepImage` ids, `pages` their OCR results in page order,
 * fetched by the caller.
 */
export function createPrepMetaJobDefinition(pages: Pick<Page, "text" | "language">[], deps: JobDeps): JobDefinition<PrepMetaOutput> {
  const language = resolveLanguage(pages)
  const pageTexts = pages.map(page => page.text)
  return {
    type: PREP_META_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<PrepMetaOutput>> {
      const { model, tier, timeoutMs } = ctx.job.config

      const { output, meta } = await runPrepMeta(pageTexts, language, model, tier, ctx.signal, { ...deps, timeoutMs })

      return {
        output: {
          title: output.title,
          description: output.description,
          grade: output.grade,
          discipline: disciplineToEnum(output.discipline),
        },
        metas: [ meta ],
        wastedMetas: [],
      }
    },
  }
}
