import { Prisma, type Job as JobRow } from "@prisma/client"

import type { ExecutionConfig, Job, JobOutcome, JobStatus, QuestionSpec } from "@/core/job"
import type { Store } from "@/core/ports"
import { CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/lib/jobs/jobTypes"
import type { PrepMetaOutput } from "@/lib/jobs/prepMetaJob"
import { prisma } from "@/lib/prisma"
import { toGenerationMeta } from "@/types/generationMeta"
import type { Concept } from "@/types/pipeline"
import type { OcrResult } from "@/types/prep"
import { difficultySchema, type GeneratedQuestion } from "@/types/questions"

import { ForbiddenError, NotFoundError } from "./errors"

/** Looks up which Prep owns a job input entity (ADR point 4). `prepImage` (produced by the
 *  `ocr` job, #270) and `concept` (produced by the `concepts` job, #272 — via its
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
    return { ...base, status: "failed", output: null, failureReason: row.failureReason }
  }
  if (row.output !== null || row.failureReason !== null) {
    throw new Error(`Job ${row.id} is created but already has output or a failureReason`)
  }
  return { ...base, status: "created", output: null, failureReason: null }
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
      const row = await prisma.job.create({
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
      return toJob<TOutput>(row)
    },

    async getJob<TOutput = unknown>(actorId: string, jobId: string): Promise<Job<TOutput> | null> {
      const job = await prisma.job.findUnique({ where: { id: jobId }, include: { inputs: true, prep: true } })
      if (!job) return null
      if (job.prep.userId !== actorId) throw new ForbiddenError(`Job ${jobId} is not owned by ${actorId}`)
      return toJob<TOutput>(job)
    },

    async existingIds(actorId: string, ids: string[]): Promise<Set<string>> {
      if (ids.length === 0) return new Set()
      const [ images, concepts ] = await Promise.all([
        prisma.prepImage.findMany({ where: { id: { in: ids }, prep: { userId: actorId } }, select: { id: true } }),
        prisma.concept.findMany({ where: { id: { in: ids }, producedByJob: { prep: { userId: actorId } } }, select: { id: true } }),
      ])
      return new Set([ ...images.map(i => i.id), ...concepts.map(c => c.id) ])
    },

    async commitJob<TOutput>(
      actorId: string,
      jobId: string,
      fromStatus: JobStatus,
      outcome: JobOutcome<TOutput>,
    ): Promise<boolean> {
      const job = await assertOwnsJob(actorId, jobId)

      const data = outcome.status === "executed"
        ? { status: "executed" as const, output: outcome.output as Prisma.InputJsonValue, failureReason: null, executedBy: actorId, updatedAt: new Date() }
        : { status: "failed" as const, output: Prisma.JsonNull, failureReason: outcome.failureReason, executedBy: actorId, updatedAt: new Date() }

      return prisma.$transaction(async tx => {
        const result = await tx.job.updateMany({ where: { id: jobId, status: fromStatus }, data })
        if (result.count !== 1) return false

        await writeDomainRows(tx, job, outcome)
        return true
      })
    },
  }
}

/** A prep's `created`/`failed` jobs, oldest first — what "resume" re-executes. */
export async function listUnfinishedJobs(actorId: string, prepId: string): Promise<Job[]> {
  const prep = await prisma.prep.findUnique({ where: { id: prepId } })
  if (!prep) throw new NotFoundError(`Prep ${prepId} not found`)
  if (prep.userId !== actorId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${actorId}`)

  const rows = await prisma.job.findMany({
    where: { prepId, status: { in: [ "created", "failed" ] } },
    include: { inputs: true },
    orderBy: { createdAt: "asc" },
  })
  return rows.map(row => toJob(row))
}

type JobWithInputs = JobRow & { inputs: { entityId: string }[] }

/** Runs inside `commitJob`'s transaction, after the conditional status update won. */
const DOMAIN_WRITERS: Record<string, (tx: Prisma.TransactionClient, job: JobWithInputs, output: never) => Promise<unknown>> = {
  [OCR_JOB_TYPE]: writeOcrOutput,
  [CONCEPTS_JOB_TYPE]: writeConceptsOutput,
  [PREP_META_JOB_TYPE]: writePrepMetaOutput,
  [QUESTION_JOB_TYPE]: writeQuestionOutput,
}

/** Writes an outcome's domain rows and `GenerationMeta` rows (wasted ones flagged) for `job`. */
async function writeDomainRows(tx: Prisma.TransactionClient, job: JobWithInputs, outcome: JobOutcome<unknown>): Promise<void> {
  if (outcome.status === "executed") {
    const write = DOMAIN_WRITERS[job.type]
    if (!write) throw new Error(`Job ${job.id} has unknown type "${job.type}"`)
    await write(tx, job, outcome.output as never)
    await tx.generationMeta.createMany({ data: outcome.metas.map(meta => toGenerationMeta(job.id, meta)) })
  }
  await tx.generationMeta.createMany({ data: outcome.wastedMetas.map(meta => toGenerationMeta(job.id, meta, true)) })
}

/** Writes the OCR text/visual elements straight onto the target `PrepImage` row (ADR point 6, no staging). */
function writeOcrOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: OcrResult) {
  const result: OcrResult = { text: output.text, visual_elements: output.visual_elements }
  return tx.prepImage.update({
    where: { id: job.inputs[0].entityId },
    data: { ocrResult: result as unknown as Prisma.InputJsonValue, producedByJobId: job.id },
  })
}

/** Creates one `Concept` row per merged concept. */
function writeConceptsOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: Concept[]) {
  return tx.concept.createMany({ data: output.map(c => ({ ...c, producedByJobId: job.id })) })
}

/** Writes title/description/grade/discipline onto the `Prep` row, resolved through the input concept's `producedByJob`. */
async function writePrepMetaOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: PrepMetaOutput) {
  const conceptId = job.inputs[0].entityId
  const concept = await tx.concept.findUnique({
    where: { id: conceptId },
    select: { producedByJob: { select: { prepId: true } } },
  })
  if (!concept) throw new NotFoundError(`Concept ${conceptId} not found`)
  return tx.prep.update({ where: { id: concept.producedByJob.prepId }, data: output })
}

/** Creates the `Question` row, typed by the job's `questionType`/`difficulty`. */
function writeQuestionOutput(tx: Prisma.TransactionClient, job: JobWithInputs, output: GeneratedQuestion) {
  if (job.questionType === null || job.difficulty === null) throw new Error(`Job ${job.id} has no questionType/difficulty`)
  return tx.question.create({
    data: {
      type: job.questionType,
      difficulty: difficultySchema.parse(job.difficulty),
      content: output as unknown as Prisma.InputJsonValue,
      prepId: job.prepId,
      producedByJobId: job.id,
    },
  })
}
