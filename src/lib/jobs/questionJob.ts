import type { JobRunResult } from "@/core/job"
import { QUESTION_JOB_TYPE } from "@/core/lib/jobs/jobTypes"
import { resolveLanguage } from "@/core/lib/language"
import type { JobDeps } from "@/core/ports"
import { JobRunError, type JobDefinition, type JobRunContext } from "@/core/runJob"
import type { AgentMeta } from "@/lib/agent"
import { BUILDERS } from "@/lib/agents/builders"
import type { RewriteInput } from "@/lib/agents/builders/rewrite"
import { reviewFeedback, runQuestionReviewer } from "@/lib/agents/QuestionReviewer"
import type { QuestionTask, StoredConcept } from "@/types/pipeline"
import { difficultySchema, questionTypeSchema, type GeneratedQuestion } from "@/types/questions"

/**
 * One job per task — `inputIds` are the `Concept` ids the task covers, its type/difficulty
 * come from `ctx.job.question`. `concepts` must already be fetched by the caller. Runs the
 * build → review → rewrite loop for at most `maxRetries + 1` attempts; each rejected or
 * errored attempt's calls travel as `wastedMetas` (on failure, inside a `JobRunError`), the
 * passing attempt's calls as `metas`. Exhausting the attempts fails the job.
 */
export function createQuestionJobDefinition(concepts: StoredConcept[], deps: JobDeps): JobDefinition<GeneratedQuestion> {
  const language = resolveLanguage(concepts)
  return {
    type: QUESTION_JOB_TYPE,
    async run(ctx: JobRunContext): Promise<JobRunResult<GeneratedQuestion>> {
      const { model, tier, timeoutMs, maxRetries } = ctx.job.config
      const agentDeps = { ...deps, timeoutMs }
      if (!ctx.job.question) throw new Error(`Job ${ctx.job.id} has no questionType/difficulty`)
      const task: QuestionTask = {
        concepts,
        type: questionTypeSchema.parse(ctx.job.question.questionType),
        difficulty: difficultySchema.parse(ctx.job.question.difficulty),
      }

      const maxAttempts = maxRetries + 1
      const wastedMetas: AgentMeta[] = []
      let rewrite: RewriteInput | undefined
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const attemptMetas: AgentMeta[] = []
        let built: GeneratedQuestion
        let review: Awaited<ReturnType<typeof runQuestionReviewer>>
        try {
          const build = await BUILDERS[task.type](task, model, tier, language, ctx.signal, rewrite, agentDeps)
          attemptMetas.push(build.meta)
          built = build.output
          review = await runQuestionReviewer(built, task, model, tier, language, ctx.signal, agentDeps)
          attemptMetas.push(review.meta)
        } catch (e) {
          throw new JobRunError([ ...wastedMetas, ...attemptMetas ], e)
        }

        if (review.output.passed) return { output: built, metas: attemptMetas, wastedMetas }

        wastedMetas.push(...attemptMetas)
        rewrite = { question: built, feedback: reviewFeedback(review.output.review) }
      }

      throw new JobRunError(wastedMetas, new Error(`No passing review after ${maxAttempts} attempt(s)`))
    },
  }
}
