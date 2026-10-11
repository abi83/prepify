/**
 * Pure planner: which jobs a prep needs next. No Next/Prisma imports — safe to unit-test in
 * isolation, like `taskBuilder.ts`.
 */
import type { QuestionSpec } from "@/core/job"
import type { Concept } from "@/types/pipeline"

import type { GenerationConfig } from "./generationConfig"
import { CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "./jobs/jobTypes"
import { buildQuestionTasks } from "./taskBuilder"

/** What a prep already has — completed outputs only, not jobs that exist but haven't run. */
export interface PrepState {
  images: { id: string; ocrDone: boolean }[]
  concepts: (Concept & { id: string })[]
  prepMetaDone: boolean
  questionCount: number
}

/** `questionCount` is the total the prep should end up with. */
export type PlanTarget = GenerationConfig

export interface JobSpec {
  type: string
  inputIds: string[]
  question: QuestionSpec | null
}

/**
 * The jobs for the next unmet stage: OCR → concepts → `prep.meta` → question tasks. Empty
 * when the prep meets `target` (or has no images to start from).
 */
export function nextJobs(state: PrepState, target: PlanTarget): JobSpec[] {
  const pendingImages = state.images.filter(image => !image.ocrDone)
  if (pendingImages.length > 0) {
    return pendingImages.map(image => ({ type: OCR_JOB_TYPE, inputIds: [ image.id ], question: null }))
  }
  if (state.images.length === 0) return []

  if (state.concepts.length === 0) {
    return [ { type: CONCEPTS_JOB_TYPE, inputIds: state.images.map(image => image.id), question: null } ]
  }

  if (!state.prepMetaDone) {
    return [ { type: PREP_META_JOB_TYPE, inputIds: state.concepts.map(concept => concept.id), question: null } ]
  }

  const missing = target.questionCount - state.questionCount
  if (missing <= 0) return []

  const idByConcept = new Map<Concept, string>(state.concepts.map(concept => [ concept, concept.id ]))
  return buildQuestionTasks(state.concepts, { ...target, questionCount: missing }).map(task => ({
    type: QUESTION_JOB_TYPE,
    inputIds: task.concepts.map(concept => idByConcept.get(concept)!),
    question: { questionType: task.type, difficulty: task.difficulty },
  }))
}
