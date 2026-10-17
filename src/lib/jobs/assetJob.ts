import type { JobRunResult } from "@/core/job"
import { activeAssetHint } from "@/core/lib/assetHint"
import type { JobDeps, QuestionRef } from "@/core/ports"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import { routeAsset, type AssetOutput } from "@/lib/agents/assets/assetRouter"
import { ASSET_JOB_TYPE } from "@/types/jobTypes"

/** One job per question — `inputIds` is `[questionId]`. Generates the asset its `asset_hint` asks for; `table`/`svg` hints yield an empty blob, which is not persisted. */
export function createAssetJobDefinition(question: QuestionRef, deps: JobDeps): JobDefinition<AssetOutput> {
  return {
    type: ASSET_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<AssetOutput>> {
      const { model, tier, timeoutMs } = ctx.job.config
      const hint = activeAssetHint(question.content)
      if (!hint) throw new Error(`Question ${question.id} needs no asset`)
      const result = await routeAsset(hint, model, tier, ctx.signal, { ...deps, timeoutMs })
      return { output: result.output, metas: [ result.meta ], wastedMetas: [] }
    },
  }
}
