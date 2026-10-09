import { Prisma, type Job as JobRow, type PrepDiscipline } from "@prisma/client"

import type { ExecutionConfig, Job, JobOutcome, JobStatus } from "@/core/job"
import type { Store } from "@/core/ports"
import type { AgentMeta } from "@/lib/agent"
import { prisma } from "@/lib/prisma"
import { toGenerationMeta } from "@/types/generationMeta"
import type { Concept } from "@/types/pipeline"
import type { OcrResult } from "@/types/prep"

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
  const base = {
    id: row.id,
    type: row.type,
    inputIds: row.inputs.map(i => i.entityId),
    config: { model: row.model, tier: row.tier, timeoutMs: row.timeoutMs, maxRetries: row.maxRetries } satisfies ExecutionConfig,
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
      await assertOwnsJob(actorId, jobId)

      const data = outcome.status === "executed"
        ? { status: "executed" as const, output: outcome.output as Prisma.InputJsonValue, failureReason: null, executedBy: actorId, updatedAt: new Date() }
        : { status: "failed" as const, output: Prisma.JsonNull, failureReason: outcome.failureReason, executedBy: actorId, updatedAt: new Date() }

      const result = await prisma.job.updateMany({ where: { id: jobId, status: fromStatus }, data })
      return result.count === 1
    },
  }
}

/**
 * Persists the `ocr` job's output: writes the OCR text/visual elements straight onto the
 * target `PrepImage` row (ADR point 6, no staging) and records the LLM call's cost against
 * the job. No ownership check — called from inside a job's `run`, after `runJob` has already
 * authorized the job via `Store`, same as `generationMetaRepository.record`.
 */
export async function recordOcrOutcome(jobId: string, imageId: string, result: OcrResult, meta: AgentMeta): Promise<void> {
  const image = await prisma.prepImage.findUnique({ where: { id: imageId }, select: { prepId: true } })
  if (!image) throw new NotFoundError(`PrepImage ${imageId} not found`)

  await prisma.$transaction([
    prisma.prepImage.update({
      where: { id: imageId },
      data: { ocrResult: result as unknown as Prisma.InputJsonValue, producedByJobId: jobId },
    }),
    prisma.generationMeta.create({ data: { ...toGenerationMeta("prep", image.prepId, meta), jobId } }),
  ])
}

/**
 * Persists the `concepts` job's output: creates one `Concept` row per merged concept and
 * records each LLM call's cost against the job. `imageId` is only used to resolve the owning
 * Prep for the `GenerationMeta` rows. No ownership check — same precedent as `recordOcrOutcome`.
 */
export async function recordConceptsOutcome(jobId: string, imageId: string, concepts: Concept[], metas: AgentMeta[]): Promise<void> {
  const image = await prisma.prepImage.findUnique({ where: { id: imageId }, select: { prepId: true } })
  if (!image) throw new NotFoundError(`PrepImage ${imageId} not found`)

  await prisma.$transaction([
    prisma.concept.createMany({ data: concepts.map(c => ({ ...c, producedByJobId: jobId })) }),
    ...metas.map(meta => prisma.generationMeta.create({ data: { ...toGenerationMeta("prep", image.prepId, meta), jobId } })),
  ])
}

export interface PrepMetaResult {
  title: string
  description: string
  grade: number | null
  discipline: PrepDiscipline | null
}

/**
 * Persists the `prep.meta` job's output: writes title/description/grade/discipline straight
 * onto the target `Prep` row (resolved through the input concept's `producedByJob`) and
 * records each LLM call's cost against the job. No ownership check — same precedent as
 * `recordOcrOutcome`.
 */
export async function recordPrepMetaOutcome(jobId: string, conceptId: string, result: PrepMetaResult, metas: AgentMeta[]): Promise<void> {
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { producedByJob: { select: { prepId: true } } },
  })
  if (!concept) throw new NotFoundError(`Concept ${conceptId} not found`)
  const { prepId } = concept.producedByJob

  await prisma.$transaction([
    prisma.prep.update({ where: { id: prepId }, data: result }),
    ...metas.map(meta => prisma.generationMeta.create({ data: { ...toGenerationMeta("prep", prepId, meta), jobId } })),
  ])
}
