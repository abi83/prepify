import type { JobStatus, Prep } from "@prisma/client"

import { OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "@/lib/jobs/jobTypes"
import { nextJobs, type PlanTarget, type PrepState } from "@/lib/planner"
import { prisma } from "@/lib/prisma"

/** The planner's view of a prep: completed outputs only. No ownership check — callers resolve the prep first. */
export async function loadPrepState(prepId: string): Promise<PrepState> {
  const [ images, concepts, prepMetaJobs, questionCount ] = await Promise.all([
    prisma.prepImage.findMany({ where: { prepId }, select: { id: true, ocrResult: true }, orderBy: { createdAt: "asc" } }),
    prisma.concept.findMany({ where: { producedByJob: { prepId } }, orderBy: { createdAt: "asc" } }),
    prisma.job.count({ where: { prepId, type: PREP_META_JOB_TYPE, status: "executed" } }),
    prisma.question.count({ where: { prepId } }),
  ])

  return {
    images: images.map(image => ({ id: image.id, ocrDone: image.ocrResult !== null })),
    concepts: concepts.map(({ id, name, description, importance, misconceptions, language }) => ({ id, name, description, importance, misconceptions, language })),
    prepMetaDone: prepMetaJobs > 0,
    questionCount,
  }
}

export interface PrepProgress {
  hasConcepts: boolean
  totalQuestions: number // question jobs created so far, any status
  completedQuestions: number // executed
  failedQuestions: number // failed, until resume re-executes them
}

/** What generation has done so far, for the UI. Null until the first job past OCR exists — uploading alone isn't "generation started". No ownership check — callers resolve the prep first. */
export async function getPrepProgress(prepId: string): Promise<PrepProgress | null> {
  const [ conceptCount, questionJobs, otherJobs ] = await Promise.all([
    prisma.concept.count({ where: { producedByJob: { prepId } } }),
    prisma.job.groupBy({ by: [ "status" ], where: { prepId, type: QUESTION_JOB_TYPE }, _count: true }),
    prisma.job.count({ where: { prepId, type: { notIn: [ OCR_JOB_TYPE, QUESTION_JOB_TYPE ] } } }),
  ])
  if (otherJobs === 0 && questionJobs.length === 0) return null

  const countOf = (status: JobStatus) => questionJobs.find(group => group.status === status)?._count ?? 0
  return {
    hasConcepts: conceptCount > 0,
    totalQuestions: questionJobs.reduce((sum, group) => sum + group._count, 0),
    completedQuestions: countOf("executed"),
    failedQuestions: countOf("failed"),
  }
}

/** Preps owned by `userId` that still need jobs to reach `target`. Unlike `listOwnedPreps`, includes inactive preps — those are the unfinished ones. */
export async function listUnfinishedPreps(userId: string, target: PlanTarget): Promise<Prep[]> {
  const preps = await prisma.prep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
  const states = await Promise.all(preps.map(prep => loadPrepState(prep.id)))
  return preps.filter((_, i) => nextJobs(states[i], target).length > 0)
}
