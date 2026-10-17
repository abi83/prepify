import type { PageConcepts, StoredConcept } from "./pipeline"

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
  /** Jobs that are not executed and can still be resumed. */
  unfinishedJobCount: number
  /** Existing questions per concept id; concepts without questions are absent. */
  conceptUsage: Record<string, number>
  /** Questions whose `asset_hint` asks for an asset and that have neither an asset nor an `asset` job (any status). */
  assetQuestionIds: string[]
}
