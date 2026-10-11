import * as jobActions from "@/actions/jobs"
import type { JobDefinition, JobRunContext } from "@/core/runJob"
import type { AgentMeta } from "@/lib/agent"
import { BUILDERS } from "@/lib/agents/builders"
import type { RewriteInput } from "@/lib/agents/builders/rewrite"
import { reviewFeedback, runQuestionReviewer } from "@/lib/agents/QuestionReviewer"
import type { Logger } from "@/lib/logger"
import type { Sampler } from "@/lib/sampler/schema"
import type { Concept, QuestionTask } from "@/types/pipeline"
import { difficultySchema, questionTypeSchema, type GeneratedQuestion } from "@/types/questions"

import { QUESTION_JOB_TYPE } from "./jobTypes"

/**
 * One job per task — `inputIds` are the `Concept` ids the task covers, its type/difficulty
 * come from `ctx.job.question`. `concepts` must already be fetched by the caller. Runs the
 * build → review → rewrite loop for at most `maxRetries + 1` attempts; each rejected or
 * errored attempt's calls are recorded `wasted` as it ends, and the passing attempt's calls
 * are recorded with the `Question` row. Exhausting the attempts fails the job.
 */
export function createQuestionJobDefinition(concepts: Concept[], language: string, logger: Logger, sampler: Sampler): JobDefinition<GeneratedQuestion> {
  return {
    type: QUESTION_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<GeneratedQuestion> {
      const { model, tier, maxRetries } = ctx.job.config
      if (!ctx.job.question) throw new Error(`Job ${ctx.job.id} has no questionType/difficulty`)
      const task: QuestionTask = {
        concepts,
        type: questionTypeSchema.parse(ctx.job.question.questionType),
        difficulty: difficultySchema.parse(ctx.job.question.difficulty),
      }

      const maxAttempts = maxRetries + 1
      let rewrite: RewriteInput | undefined
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const attemptMetas: AgentMeta[] = []
        let built: GeneratedQuestion
        let review: Awaited<ReturnType<typeof runQuestionReviewer>>
        try {
          const build = await BUILDERS[task.type](task, ctx.apiKey, model, tier, language, ctx.signal, rewrite, logger, sampler)
          attemptMetas.push(build.meta)
          built = build.output
          review = await runQuestionReviewer(built, task, ctx.apiKey, model, tier, language, ctx.signal, logger, sampler)
          attemptMetas.push(review.meta)
        } catch (e) {
          await jobActions.recordWastedCalls(ctx.job.id, attemptMetas)
          throw e
        }

        if (review.output.passed) {
          await jobActions.recordQuestionOutcome(ctx.job.id, { type: task.type, difficulty: task.difficulty, content: built }, attemptMetas)
          return built
        }

        await jobActions.recordWastedCalls(ctx.job.id, attemptMetas)
        rewrite = { question: built, feedback: reviewFeedback(review.output.review) }
      }

      throw new Error(`No passing review after ${maxAttempts} attempt(s)`)
    },
  }
}
