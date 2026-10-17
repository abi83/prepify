// Separate from the job definitions so the pure planner can name job types without importing agents or Prisma.
export const OCR_JOB_TYPE = "ocr"
/** One per page; its output is that page's `PageConcepts`. */
export const CONCEPTS_EXTRACT_JOB_TYPE = "concepts.extract"
/** Merges the pages' extracted concepts into the prep's `Concept` rows. */
export const CONCEPTS_JOB_TYPE = "concepts"
export const PREP_META_JOB_TYPE = "prep.meta"
export const QUESTION_JOB_TYPE = "question"
/** One per question; its output is the generated asset blob. */
export const ASSET_JOB_TYPE = "asset"

/** The pipeline's stages in execution order: later stages read earlier stages' outputs. */
export const JOB_STAGES = [ "ocr", "concepts", "questions", "assets" ] as const
export type JobStage = typeof JOB_STAGES[number]

const STAGE_BY_JOB_TYPE: Record<string, JobStage> = {
  [OCR_JOB_TYPE]: "ocr",
  [CONCEPTS_EXTRACT_JOB_TYPE]: "concepts",
  [CONCEPTS_JOB_TYPE]: "concepts",
  [PREP_META_JOB_TYPE]: "concepts",
  [QUESTION_JOB_TYPE]: "questions",
  [ASSET_JOB_TYPE]: "assets",
}

export function stageOf(jobType: string): JobStage {
  const stage = STAGE_BY_JOB_TYPE[jobType]
  if (!stage) throw new Error(`Unknown job type "${jobType}"`)
  return stage
}
