/** Characters per chunk sent to ConceptExtractor (BYOK). */
export const CHUNK_SIZE = 15_000

/** Overlap between consecutive chunks to avoid splitting concepts at boundaries. */
export const CHUNK_OVERLAP = 1_000

/** Hard limit for BYOK users — inputs beyond this require user confirmation before truncation. */
export const BYOK_TEXT_HARD_LIMIT = 100_000

/** Hard limit for free-tier users — enforced server-side in Phase 4. */
export const FREE_TEXT_HARD_LIMIT = 10_000
