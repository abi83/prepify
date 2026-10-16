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

/** A page's merge into the prep's stored concepts: no `concepts` job yet, one that hasn't executed, or an executed one. */
export type PageMergeState = "none" | "planned" | "merged"

/** What a prep already has — completed outputs only, not jobs that exist but haven't run. */
export interface PrepState {
  images: { id: string; ocrDone: boolean; concepts: PageConceptsState; merge: PageMergeState }[]
  concepts: (StoredConcept & { id: string })[]
  prepMetaDone: boolean
  questionCount: number
  /** `question` jobs in any status — once any exist, they are the question plan. */
  questionJobCount: number
  /** Questions whose `asset_hint` asks for an asset and that have neither an asset nor an `asset` job (any status). */
  assetQuestionIds: string[]
}

/** `questionCount` is the total a first question plan should reach. */
export type PlanTarget = GenerationConfig

export interface JobSpec {
  type: string
  inputIds: string[]
  question: QuestionSpec | null
}

/**
 * Extraction for every page first, then one merge at a time in upload order: a page merges into the
 * concepts stored so far, so it waits for the pages before it. `null` once every found page is merged.
 * A merged page is never re-extracted: preps merged before extraction jobs existed have none.
 */
function nextConceptsJobs(images: PrepState["images"]): JobSpec[] | null {
  const pending = images.filter(image => image.concepts.status === "pending" && image.merge !== "merged")
  if (pending.length > 0) {
    return pending.map(image => ({ type: CONCEPTS_EXTRACT_JOB_TYPE, inputIds: [ image.id ], question: null }))
  }
  const next = images.find(image => image.concepts.status === "found" && image.merge !== "merged")
  if (!next) return null
  if (next.merge === "planned") return []
  return [ { type: CONCEPTS_JOB_TYPE, inputIds: [ next.id ], question: null } ]
}

/** Throws when the planner stopped because no page yielded concepts, naming why. Call once it has nothing left to plan. */
export function assertConceptsFound(state: PrepState): void {
  if (state.images.length === 0 || state.concepts.length > 0) return
  const reasons = state.images.flatMap(image => image.concepts.status === "empty" ? [ image.concepts.reason ] : [])
  throw new Error(`No concepts found in any page (${[ ...new Set(reasons) ].join(", ")})`)
}

/**
 * The jobs for the next unmet stage: OCR → concept extraction (per page) → concepts merge (per page, in
 * order) → question tasks → one asset job per question that needs one. `prep.meta` reads raw OCR text, so it
 * is planned with the first stage after OCR and runs alongside it. Empty when the prep has no images
 * to start from, every page came up empty (see `assertConceptsFound`), or its question and asset
 * jobs are already planned — unfinished ones are resumed, not topped up to `target`.
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
  const conceptsJobs = nextConceptsJobs(state.images)
  if (conceptsJobs) return conceptsJobs
  if (state.concepts.length === 0) return []

  if (state.questionJobCount > 0) {
    return state.assetQuestionIds.map(questionId => ({ type: ASSET_JOB_TYPE, inputIds: [ questionId ], question: null }))
  }

  const idByConcept = new Map<Concept, string>(state.concepts.map(concept => [ concept, concept.id ]))
  return buildQuestionTasks(state.concepts, target).map(task => ({
    type: QUESTION_JOB_TYPE,
    inputIds: task.concepts.map(concept => idByConcept.get(concept)!),
    question: { questionType: task.type, difficulty: task.difficulty },
  }))
}
