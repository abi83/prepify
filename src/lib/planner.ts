/**
 * Pure planner: which jobs a prep needs next. No Next/Prisma imports — safe to unit-test in
 * isolation, like `taskBuilder.ts`.
 */
import type { QuestionSpec } from "@/core/job"
import type { Concept, PageConcepts, StoredConcept } from "@/types/pipeline"

import type { GenerationConfig } from "./generationConfig"
import { ASSET_JOB_TYPE, CONCEPTS_EXTRACT_JOB_TYPE, CONCEPTS_JOB_TYPE, OCR_JOB_TYPE, PREP_META_JOB_TYPE, QUESTION_JOB_TYPE } from "./jobs/jobTypes"
import { buildQuestionTasks } from "./taskBuilder"

/** A page's concept extraction: not run yet, or its outcome. */
export type PageConceptsState = PageConcepts | { status: "pending" }

/** What a prep already has — completed outputs only, not jobs that exist but haven't run. */
export interface PrepState {
  images: { id: string; ocrDone: boolean; concepts: PageConceptsState }[]
  concepts: (StoredConcept & { id: string })[]
  prepMetaDone: boolean
  questionCount: number
  /** `question` jobs in any status — once any exist, they are the question plan. */
  questionJobCount: number
  /** Jobs that are not executed and can still be resumed. */
  unfinishedJobCount: number
  /** Existing questions per concept id; concepts without questions are absent. */
  conceptUsage: Record<string, number>
  /** Questions whose `asset_hint` asks for an asset and that have neither an asset nor an `asset` job (any status). */
  assetQuestionIds: string[]
}

/**
 * `questionCount` is the total a first question plan should reach. `additionalQuestions` is a
 * one-off request to add that many questions to a prep that already has question jobs.
 */
export type PlanTarget = GenerationConfig & { additionalQuestions?: number }

/** Tallies concept ids, one per question that uses the concept. */
export function countConceptUsage(conceptIds: string[]): Record<string, number> {
  const usage: Record<string, number> = {}
  for (const id of conceptIds) usage[id] = (usage[id] ?? 0) + 1
  return usage
}

export interface JobSpec {
  type: string
  inputIds: string[]
  question: QuestionSpec | null
}

function nextConceptsJobs(images: PrepState["images"]): JobSpec[] {
  const pending = images.filter(image => image.concepts.status === "pending")
  if (pending.length > 0) {
    return pending.map(image => ({ type: CONCEPTS_EXTRACT_JOB_TYPE, inputIds: [ image.id ], question: null }))
  }
  const found = images.filter(image => image.concepts.status === "found")
  if (found.length === 0) return []
  return [ { type: CONCEPTS_JOB_TYPE, inputIds: found.map(image => image.id), question: null } ]
}

/** Throws when the planner stopped because no page yielded concepts, naming why. Call once it has nothing left to plan. */
export function assertConceptsFound(state: PrepState): void {
  if (state.images.length === 0 || state.concepts.length > 0) return
  const reasons = state.images.flatMap(image => image.concepts.status === "empty" ? [ image.concepts.reason ] : [])
  throw new Error(`No concepts found in any page (${[ ...new Set(reasons) ].join(", ")})`)
}

/**
 * The jobs for the next unmet stage: OCR → concept extraction (per page) → concepts merge →
 * question tasks → one asset job per question that needs one. `prep.meta` reads raw OCR text, so it
 * is planned with the first stage after OCR and runs alongside it. Empty when the prep has no images
 * to start from, every page came up empty (see `assertConceptsFound`), or its question and asset
 * jobs are already planned — unfinished ones are resumed, not topped up to `target`.
 * A `target.additionalQuestions` request instead plans that many new question jobs, unless jobs are unfinished.
 */
export function nextJobs(state: PrepState, target: PlanTarget): JobSpec[] {
  const pendingImages = state.images.filter(image => !image.ocrDone)
  if (pendingImages.length > 0) {
    return pendingImages.map(image => ({ type: OCR_JOB_TYPE, inputIds: [ image.id ], question: null }))
  }
  if (state.images.length === 0) return []

  const meta: JobSpec[] = state.prepMetaDone ? [] : [ { type: PREP_META_JOB_TYPE, inputIds: state.images.map(image => image.id), question: null } ]
  return [ ...nextStageJobs(state, target), ...meta ]
}

function nextStageJobs(state: PrepState, target: PlanTarget): JobSpec[] {
  if (state.concepts.length === 0) return nextConceptsJobs(state.images)

  const requested = target.additionalQuestions
  if (state.questionJobCount > 0 && (requested === undefined || state.unfinishedJobCount > 0)) {
    return state.assetQuestionIds.map(questionId => ({ type: ASSET_JOB_TYPE, inputIds: [ questionId ], question: null }))
  }

  const idByConcept = new Map<Concept, string>(state.concepts.map(concept => [ concept, concept.id ]))
  const usageByName = new Map(state.concepts.map(concept => [ concept.name, state.conceptUsage[concept.id] ?? 0 ]))
  const config = { ...target, questionCount: requested ?? target.questionCount }
  return buildQuestionTasks(state.concepts, config, usageByName).map(task => ({
    type: QUESTION_JOB_TYPE,
    inputIds: task.concepts.map(concept => idByConcept.get(concept)!),
    question: { questionType: task.type, difficulty: task.difficulty },
  }))
}
