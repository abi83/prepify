import type { JobDefinition, JobRunContext } from "@/core/runJob"
import type { AgentImage } from "@/lib/agent"
import { runOcrAgent, type OcrOutput } from "@/lib/agents/OcrAgent"
import type { Logger } from "@/lib/logger"
import type { Sampler } from "@/lib/sampler/schema"
import * as jobRepository from "@/repositories/jobRepository"

export const OCR_JOB_TYPE = "ocr"

/**
 * One job per `PrepImage` row — `inputIds[0]` is that row's id. `images` must already be
 * fetched by the caller (signed-URL download, etc.); this only wraps `runOcrAgent` and the
 * write to the target row. Wiring this into the live upload flow (`prepImageOcr.ts`) is #275.
 */
export function createOcrJobDefinition(images: AgentImage[], logger: Logger, sampler: Sampler): JobDefinition<OcrOutput> {
  return {
    type: OCR_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<OcrOutput> {
      const [ imageId ] = ctx.job.inputIds
      const { output, meta } = await runOcrAgent(images, ctx.apiKey, ctx.job.config.model, ctx.job.config.tier, ctx.signal, logger, sampler)
      await jobRepository.recordOcrOutcome(ctx.job.id, imageId, { text: output.text, visual_elements: output.visual_elements }, meta)
      return output
    },
  }
}
