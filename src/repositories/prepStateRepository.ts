import type { Prep } from "@prisma/client"

import { PREP_META_JOB_TYPE } from "@/lib/jobs/jobTypes"
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
    concepts: concepts.map(({ id, name, description, importance, misconceptions }) => ({ id, name, description, importance, misconceptions })),
    prepMetaDone: prepMetaJobs > 0,
    questionCount,
  }
}

/** Preps owned by `userId` that still need jobs to reach `target`. Unlike `listOwnedPreps`, includes inactive preps — those are the unfinished ones. */
export async function listUnfinishedPreps(userId: string, target: PlanTarget): Promise<Prep[]> {
  const preps = await prisma.prep.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })
  const states = await Promise.all(preps.map(prep => loadPrepState(prep.id)))
  return preps.filter((_, i) => nextJobs(states[i], target).length > 0)
}
