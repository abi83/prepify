export const SUPPORTED_LANGUAGES = ['en', 'de', 'fr', 'it', 'es', 'pl'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** Characters per chunk sent to ConceptExtractor. */
export const CHUNK_SIZE = 15_000

/** Hard limit for BYOK users — inputs beyond this require user confirmation before truncation. */
export const BYOK_TEXT_HARD_LIMIT = 100_000

