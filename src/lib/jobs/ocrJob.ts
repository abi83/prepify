import * as jobActions from "@/actions/jobs"
import type { AgentDeps } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import type { AgentImage } from "@/lib/agent"
import { runOcrAgent, type OcrOutput } from "@/lib/agents/OcrAgent"

import { OCR_JOB_TYPE } from "./jobTypes"

/**
 * One job per `PrepImage` row — `inputIds[0]` is that row's id. `images` must already be
 * fetched by the caller (signed-URL download, etc.); this only wraps `runOcrAgent` and the
 * write to the target row.
 */
export function createOcrJobDefinition(images: AgentImage[], deps: AgentDeps): JobDefinition<OcrOutput> {
  return {
    type: OCR_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<OcrOutput> {
      const [ imageId ] = ctx.job.inputIds
      const { output, meta } = await runOcrAgent(images, ctx.job.config.model, ctx.job.config.tier, ctx.signal, deps)
      await jobActions.recordOcrOutcome(ctx.job.id, imageId, { text: output.text, visual_elements: output.visual_elements }, meta)
      return output
    },
  }
}
