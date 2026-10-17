import type { JobRunResult } from "@/core/job"
import { resolveLanguage } from "@/core/lib/language"
import type { JobDeps } from "@/core/ports"
import { JobRunError, type JobDefinition, type JobRunContext } from "@/core/runJob"
import type { AgentMeta } from "@/lib/agent"
import { BUILDERS } from "@/lib/agents/builders"
import type { RewriteInput } from "@/lib/agents/builders/rewrite"
import { reviewFeedback, runQuestionReviewer } from "@/lib/agents/QuestionReviewer"
import { QUESTION_JOB_TYPE } from "@/types/jobTypes"
import type { QuestionTask, StoredConcept } from "@/types/pipeline"
import { difficultySchema, questionTypeSchema, type GeneratedQuestion } from "@/types/questions"

const MAX_REASON_COMMENT_CHARS = 300

/**
 * One job per task — `inputIds` are the `Concept` ids the task covers, its type/difficulty
 * come from `ctx.job.question`. `concepts` must already be fetched by the caller. Runs the
 * build → review → rewrite loop for at most `maxRetries + 1` attempts; each rejected or
 * errored attempt's calls travel as `wastedMetas` (on failure, inside a `JobRunError`), the
 * passing attempt's calls as `metas`. Exhausting the attempts fails the job, with the last rejection's comment as the reason.
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
      let lastRejection = ""
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
        lastRejection = review.output.review.comment.slice(0, MAX_REASON_COMMENT_CHARS)
        rewrite = { question: built, feedback: reviewFeedback(review.output.review) }
      }

      throw new JobRunError(wastedMetas, new Error(`No passing review after ${maxAttempts} attempt(s): ${lastRejection}`))
    },
  }
}
