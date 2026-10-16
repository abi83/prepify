import type { JobRunResult } from "@/core/job"
import type { JobDeps } from "@/core/ports"
import { JobRunError, type JobDefinition, type JobRunContext } from "@/core/runJob"
import type { AgentImage } from "@/lib/agent"
import { OcrRejectedError, runOcrAgent, type OcrOutput } from "@/lib/agents/OcrAgent"

import { OCR_JOB_TYPE } from "./jobTypes"

/**
 * One job per `PrepImage` row — `inputIds[0]` is that row's id. `images` must already be
 * fetched by the caller (signed-URL download, etc.); this only wraps `runOcrAgent`.
 */
export function createOcrJobDefinition(images: AgentImage[], deps: JobDeps): JobDefinition<OcrOutput> {
  return {
    type: OCR_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<OcrOutput>> {
      try {
        const { output, meta } = await runOcrAgent(images, ctx.job.config.model, ctx.job.config.tier, ctx.signal, { ...deps, timeoutMs: ctx.job.config.timeoutMs })
        return { output, metas: [ meta ], wastedMetas: [] }
      } catch (e) {
        if (e instanceof OcrRejectedError) throw new JobRunError([ e.meta ], e.cause)
        throw e
      }
    },
  }
}
