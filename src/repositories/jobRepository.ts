import { Prisma, type Job as JobRow } from "@prisma/client"

import type { ExecutionConfig, Job, JobOutcome, JobStatus, QuestionSpec } from "@/core/job"
import { resolveLanguage } from "@/core/lib/language"
import { derivePrepStatus } from "@/core/lib/prepStatus"
import type { Store } from "@/core/ports"
import { prisma } from "@/lib/prisma"
import { toGenerationMeta } from "@/types/generationMeta"
import { parseJobOutput, type AssetOutput, type OcrJobOutput, type PrepMetaOutput } from "@/types/jobOutputs"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/types/jobTypes"
import type { StoredConcept } from "@/types/pipeline"
import type { OcrResult } from "@/types/prep"
import { difficultySchema, type GeneratedQuestion } from "@/types/questions"

import { ForbiddenError, NotFoundError } from "./errors"

/** A `running` job whose heartbeat is older than this lost its runner (OOM/SIGKILL) and is marked `interrupted` on the next read. */
export const STALE_HEARTBEAT_MS = 5 * 60 * 1000

const staleCutoff = () => new Date(Date.now() - STALE_HEARTBEAT_MS)

/** Claims a job may take before a `failed` one stops being resumed. */
export const MAX_JOB_ATTEMPTS = 3

/** Recomputes `Prep.status` from the prep's jobs — the only writer of that column. Call it from every path that creates
 *  a job or can move one to executed or into/out of terminal failure (create, commit, terminal retry). */
async function syncPrepStatus(tx: Prisma.TransactionClient, prepId: string): Promise<void> {
  const jobs = await tx.job.findMany({ where: { prepId }, select: { type: true, status: true, attempts: true } })
  await tx.prep.update({ where: { id: prepId }, data: { status: derivePrepStatus(jobs, MAX_JOB_ATTEMPTS) } })
}

/** Re-executable jobs: not yet run, or failed with attempts left. */
export const RESUMABLE: Prisma.JobWhereInput = {
  OR: [
    { status: { in: [ "created", "interrupted" ] } },
    { status: "failed", attempts: { lt: MAX_JOB_ATTEMPTS } },
  ],
}

/** A `failed` job that used up its attempts — only an explicit user retry re-runs it. */
export const TERMINAL: Prisma.JobWhereInput = { status: "failed", attempts: { gte: MAX_JOB_ATTEMPTS } }

/** Persists `interrupted` on `running` jobs with a dead heartbeat — the lazy fallback for a runner that died
 *  without a SIGTERM (OOM/SIGKILL). Conditional on the stale heartbeat, so a live runner's beat wins the race. */
export async function interruptStaleJobs(where: Prisma.JobWhereInput = {}): Promise<void> {
  await prisma.job.updateMany({
    where: { ...where, status: "running", OR: [ { heartbeatAt: null }, { heartbeatAt: { lt: staleCutoff() } } ] },
    data: { status: "interrupted" },
  })
}

/** Looks up which Prep owns a job input entity (ADR point 4). `question` (the `asset` job's input) is looked up directly. `prepImage` (produced by the
 *  `ocr` job, #270) and `concept` (produced by the `concepts` merge job, #272 — via its
 *  `producedByJob`, since `Concept` has no direct `prepId`) are the only input entity types
 *  any job produces today — a new one (#273's questions) adds a branch here, not a schema change. */
async function findInputOwner(entityId: string): Promise<{ entityType: string; prepId: string } | null> {
  const image = await prisma.prepImage.findUnique({ where: { id: entityId }, select: { prepId: true } })
  if (image) return { entityType: "prepImage", prepId: image.prepId }

  const concept = await prisma.concept.findUnique({
    where: { id: entityId },
    select: { producedByJob: { select: { prepId: true } } },
  })
  if (concept) return { entityType: "concept", prepId: concept.producedByJob.prepId }

  const question = await prisma.question.findUnique({ where: { id: entityId }, select: { prepId: true } })
  if (question) return { entityType: "question", prepId: question.prepId }

  return null
}

/** Resolves every input id's owning Prep and asserts the actor owns it, before a job for
 *  them is created. All inputs must belong to the same Prep — a job spanning preps isn't a
 *  thing this contract supports. */
async function assertOwnsInputs(
  actorId: string,
  inputIds: string[],
): Promise<{ prepId: string; entityType: string; entityId: string }[]> {
  if (inputIds.length === 0) throw new Error("A job needs at least one input")

  const resolved = await Promise.all(
    inputIds.map(async entityId => {
      const owner = await findInputOwner(entityId)
      if (!owner) throw new NotFoundError(`Job input ${entityId} not found`)
      return { ...owner, entityId }
    })
  )

  const prepIds = new Set(resolved.map(r => r.prepId))
  if (prepIds.size > 1) throw new Error(`Job inputs span more than one Prep: ${[ ...prepIds ].join(", ")}`)

  const [ prepId ] = prepIds
  const prep = await prisma.prep.findUnique({ where: { id: prepId } })
  if (!prep) throw new NotFoundError(`Prep ${prepId} not found`)
  if (prep.userId !== actorId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${actorId}`)

  return resolved
}

async function assertOwnsJob(actorId: string, jobId: string): Promise<JobRow & { inputs: { entityId: string }[] }> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { inputs: true, prep: true } })
  if (!job) throw new NotFoundError(`Job ${jobId} not found`)
  if (job.prep.userId !== actorId) throw new ForbiddenError(`Job ${jobId} is not owned by ${actorId}`)
  return job
}

/** Maps a `Job` row to the core discriminated union, failing fast on a row shape the writers
 *  below can't produce (output/failureReason set for the wrong status). */
function toJob<TOutput>(row: JobRow & { inputs: { entityId: string }[] }): Job<TOutput> {
  if ((row.questionType === null) !== (row.difficulty === null)) {
    throw new Error(`Job ${row.id} has only one of questionType/difficulty`)
  }
  const question = row.questionType !== null && row.difficulty !== null
    ? { questionType: row.questionType, difficulty: row.difficulty }
    : null

  const base = {
    id: row.id,
    type: row.type,
    inputIds: row.inputs.map(i => i.entityId),
    config: { model: row.model, tier: row.tier, timeoutMs: row.timeoutMs, maxRetries: row.maxRetries } satisfies ExecutionConfig,
    question,
  }

  if (row.status === "executed") {
    if (row.output === null) throw new Error(`Job ${row.id} is executed but has no output`)
    return { ...base, status: "executed", output: row.output as TOutput, failureReason: null }
  }
  if (row.status === "failed") {
    if (row.failureReason === null) throw new Error(`Job ${row.id} is failed but has no failureReason`)
    return { ...base, status: "failed", output: null, failureReason: row.failureReason, terminal: row.attempts >= MAX_JOB_ATTEMPTS }
  }
  if (row.output !== null || row.failureReason !== null) {
    throw new Error(`Job ${row.id} is ${row.status} but already has output or a failureReason`)
  }
  return { ...base, status: row.status, output: null, failureReason: null }
}

/** `Store` port (`src/core/ports.ts`) backed by Postgres via Prisma. Owner-only: every method
 *  resolves ownership through the job's input chain (`assertOwnsInputs`/`assertOwnsJob`), per
 *  ADR point 10. */
export function createPrismaStore(): Store {
  return {
    async createJob<TOutput = unknown>(
      actorId: string,
      type: string,
      inputIds: string[],
      config: ExecutionConfig,
      question?: QuestionSpec,
    ): Promise<Job<TOutput>> {
      const inputs = await assertOwnsInputs(actorId, inputIds)
      const row = await prisma.$transaction(async tx => {
        const created = await tx.job.create({
          data: {
            prepId: inputs[0].prepId,
            type,
            model: config.model,
            tier: config.tier,
            timeoutMs: config.timeoutMs,
            maxRetries: config.maxRetries,
            questionType: question?.questionType ?? null,
            difficulty: question?.difficulty ?? null,
            createdBy: actorId,
            inputs: { create: inputs.map(({ entityType, entityId }) => ({ entityType, entityId })) },
          },
          include: { inputs: true },
        })
        await syncPrepStatus(tx, created.prepId)
        return created
      })
      return toJob<TOutput>(row)
    },

    async getJob<TOutput = unknown>(actorId: string, jobId: string): Promise<Job<TOutput> | null> {
      await interruptStaleJobs({ id: jobId })
      const job = await prisma.job.findUnique({ where: { id: jobId }, include: { inputs: true, prep: true } })
      if (!job) return null
      if (job.prep.userId !== actorId) throw new ForbiddenError(`Job ${jobId} is not owned by ${actorId}`)
      return toJob<TOutput>(job)
    },

    async existingIds(actorId: string, ids: string[]): Promise<Set<string>> {
      if (ids.length === 0) return new Set()
      const [ images, concepts, questions ] = await Promise.all([
        prisma.prepImage.findMany({ where: { id: { in: ids }, prep: { userId: actorId } }, select: { id: true } }),
        prisma.concept.findMany({ where: { id: { in: ids }, producedByJob: { prep: { userId: actorId } } }, select: { id: true } }),
        prisma.question.findMany({ where: { id: { in: ids }, prep: { userId: actorId } }, select: { id: true } }),
      ])
      return new Set([ ...images.map(i => i.id), ...concepts.map(c => c.id), ...questions.map(q => q.id) ])
    },

    async commitJob<TOutput>(
      actorId: string,
      jobId: string,
      fromStatus: JobStatus,
      outcome: JobOutcome<TOutput>,
    ): Promise<boolean> {
      const job = await assertOwnsJob(actorId, jobId)

      const checked: JobOutcome<unknown> = outcome.status === "executed"
        ? { ...outcome, output: parseJobOutput(job.type, outcome.output) }
        : outcome

      const data = checked.status === "executed"
        ? { status: "executed" as const, output: checked.output as Prisma.InputJsonValue, failureReason: null, executedBy: actorId, updatedAt: new Date() }
        : { status: "failed" as const, output: Prisma.JsonNull, failureReason: checked.failureReason, executedBy: actorId, updatedAt: new Date() }

      return prisma.$transaction(async tx => {
        // A server runner moves the job to `running` after the caller read `fromStatus`.
        const result = await tx.job.updateMany({ where: { id: jobId, status: { in: [ fromStatus, "running" ] } }, data })
        if (result.count !== 1) return false

        await writeDomainRows(tx, job, checked)
        await syncPrepStatus(tx, job.prepId)
        return true
      })
    },
  }
}

async function assertOwnsPrep(actorId: string, prepId: string): Promise<void> {
  const prep = await prisma.prep.findUnique({ where: { id: prepId } })
  if (!prep) throw new NotFoundError(`Prep ${prepId} not found`)
  if (prep.userId !== actorId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${actorId}`)
}

/** A prep's re-executable jobs (`created`/`interrupted`/`failed` with attempts left, stale `running` ones are marked `interrupted` first), oldest first — what "resume" re-executes. */
export async function listUnfinishedJobs(actorId: string, prepId: string): Promise<Job[]> {
  await assertOwnsPrep(actorId, prepId)

  await interruptStaleJobs({ prepId })
  const rows = await prisma.job.findMany({
    where: { prepId, ...RESUMABLE },
    include: { inputs: true },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(row => toJob(row))
}

/** Whether a runner is alive on `prepId`: a `running` job with a fresh heartbeat. */
export async function hasActiveRun(prepId: string): Promise<boolean> {
  return await prisma.job.count({ where: { prepId, status: "running", heartbeatAt: { gte: staleCutoff() } } }) > 0
}

/** Moves a re-executable job to `running` with a fresh heartbeat and counts the attempt; false if another runner holds it or it is terminal. */
export async function claimJob(jobId: string): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, ...RESUMABLE },
    data: { status: "running", heartbeatAt: new Date(), attempts: { increment: 1 } },
  })
  return result.count === 1
}

/** Explicit user retry: hands the prep's terminal jobs back to resume with a fresh attempt budget. Returns how many were reset. */
export async function retryTerminalJobs(actorId: string, prepId: string): Promise<number> {
  await assertOwnsPrep(actorId, prepId)
  return prisma.$transaction(async tx => {
    const result = await tx.job.updateMany({
      where: { prepId, ...TERMINAL },
      data: { status: "interrupted", attempts: 0, failureReason: null },
    })
    if (result.count > 0) await syncPrepStatus(tx, prepId)
    return result.count
  })
}

/** Explicit user retry of failed pages: hands the OCR jobs of `imageIds` back to resume with a fresh attempt budget. Other jobs are untouched. Returns how many were reset. */
export async function retryFailedPages(actorId: string, prepId: string, imageIds: string[]): Promise<number> {
  await assertOwnsPrep(actorId, prepId)
  return prisma.$transaction(async tx => {
    const result = await tx.job.updateMany({
      where: { prepId, type: OCR_JOB_TYPE, status: "failed", inputs: { some: { entityId: { in: imageIds } } } },
      data: { status: "interrupted", attempts: 0, failureReason: null },
    })
    if (result.count > 0) await syncPrepStatus(tx, prepId)
    return result.count
  })
}

export async function touchHeartbeat(jobId: string): Promise<void> {
  await prisma.job.updateMany({ where: { id: jobId, status: "running" }, data: { heartbeatAt: new Date() } })
}

/** Marks still-`running` jobs `interrupted`; committed ones are left alone. */
export async function markInterrupted(jobIds: string[]): Promise<void> {
  await prisma.job.updateMany({ where: { id: { in: jobIds }, status: "running" }, data: { status: "interrupted" } })
}

type JobWithInputs = JobRow & { inputs: { entityId: string }[] }

/** Runs inside `commitJob`'s transaction, after the conditional status update won. */
const DOMAIN_WRITERS: Record<string, (tx: Prisma.TransactionClient, job: JobWithInputs, output: never) => Promise<unknown>> = {
  [OCR_JOB_TYPE]: writeOcrOutput,
  // A page's outcome stays in `Job.output`; `loadPrepState` reads it back from there.
  [CONCEPTS_EXTRACT_JOB_TYPE]: async () => {},
  [CONCEPTS_JOB_TYPE]: writeConceptsOutput,
  [PREP_META_JOB_TYPE]: writePrepMetaOutput,
  [QUESTION_JOB_TYPE]: writeQuestionOutput,
  [ASSET_JOB_TYPE]: writeAssetOutput,
}

/** Writes an outcome's domain rows and `GenerationMeta` rows (wasted ones flagged) for `job`. */
async function writeDomainRows(tx: Prisma.TransactionClient, job: JobWithInputs, outcome: JobOutcome<unknown>): Promise<void> {
  if (outcome.status === "failed" && job.type === OCR_JOB_TYPE) {
    await tx.prepImage.update({ where: { id: job.inputs[0].entityId }, data: { status: "failed", error: outcome.failureReason } })
  }
  if (outcome.status === "executed") {
    const write = DOMAIN_WRITERS[job.type]
    if (!write) throw new Error(`Job ${job.id} has unknown type "${job.type}"`)
    await write(tx, job, outcome.output as never)
    await tx.generationMeta.createMany({ data: outcome.metas.map(meta => toGenerationMeta(job.id, meta)) })
  }
  await tx.generationMeta.createMany({ data: outcome.wastedMetas.map(meta => toGenerationMeta(job.id, meta, true)) })
}

/** Writes the OCR text/visual elements and detected language straight onto the target `PrepImage` row (ADR point 6, no staging). */
function writeOcrOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: OcrJobOutput) {
  const result: OcrResult = { title: output.title, text: output.text, visual_elements: output.visual_elements }
  return tx.prepImage.update({
    where: { id: job.inputs[0].entityId },
    data: { ocrResult: result as unknown as Prisma.InputJsonValue, language: output.language, producedByJobId: job.id, status: "done", error: null },
  })
}

/** Creates one `Concept` row per merged concept, and records their language on the `Prep`. */
async function writeConceptsOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: StoredConcept[]) {
  if (output.length === 0) return
  await tx.concept.createMany({ data: output.map(c => ({
    name: c.name,
    description: c.description,
    importance: c.importance,
    misconceptions: c.misconceptions,
    language: c.language,
    producedByJobId: job.id,
  })) })
  await tx.prep.update({ where: { id: job.prepId }, data: { language: resolveLanguage(output) } })
}

/** Writes title/description/grade/discipline onto the job's `Prep` row. */
function writePrepMetaOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: PrepMetaOutput) {
  const { title, description, grade, discipline } = output
  return tx.prep.update({ where: { id: job.prepId }, data: { title, description, grade, discipline } })
}

/** Creates the `Question` row, typed by the job's `questionType`/`difficulty`, in its input concepts' language. */
async function writeQuestionOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: GeneratedQuestion) {
  if (job.questionType === null || job.difficulty === null) throw new Error(`Job ${job.id} has no questionType/difficulty`)
  const concepts = await tx.concept.findMany({ where: { id: { in: job.inputs.map(i => i.entityId) } }, select: { language: true } })
  return tx.question.create({
    data: {
      type: job.questionType,
      difficulty: difficultySchema.parse(job.difficulty),
      language: resolveLanguage(concepts),
      content: output.content as unknown as Prisma.InputJsonValue,
      prepId: job.prepId,
      producedByJobId: job.id,
    },
  })
}

/** Creates the question's `Asset` row; an empty blob (the router skips `table`/`svg`) writes nothing. */
async function writeAssetOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: AssetOutput) {
  if (output.blob === "") return
  return tx.asset.create({ data: { questionId: job.inputs[0].entityId, type: output.type, blob: output.blob, producedByJobId: job.id } })
}
