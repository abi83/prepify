import type { JobRunResult } from "@/core/job"
import type { AgentDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import type { AgentImage } from "@/lib/agent"
import { runOcrAgent, type OcrOutput } from "@/lib/agents/OcrAgent"

import { OCR_JOB_TYPE } from "./jobTypes"

/**
 * One job per `PrepImage` row — `inputIds[0]` is that row's id. `images` must already be
 * fetched by the caller (signed-URL download, etc.); this only wraps `runOcrAgent`.
 */
export function createOcrJobDefinition(images: AgentImage[], deps: AgentDeps): JobDefinition<OcrOutput> {
  return {
    type: OCR_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<OcrOutput>> {
      const { output, meta } = await runOcrAgent(images, ctx.job.config.model, ctx.job.config.tier, ctx.signal, deps)
      return { output, metas: [ meta ], wastedMetas: [] }
    },
  }
}
