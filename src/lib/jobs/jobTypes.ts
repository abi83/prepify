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
