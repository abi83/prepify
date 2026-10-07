export const SUPPORTED_LANGUAGES = [ "en", "de", "fr", "it", "es", "pl", "nl", "pt", "ru", "uk" ] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  es: "Español",
  pl: "Polski",
  nl: "Nederlands",
  pt: "Português",
  ru: "Русский",
  uk: "Українська",
}

/** Characters per chunk sent to ConceptExtractor. */
export const CHUNK_SIZE = 15_000

/** Hard limit for BYOK users — inputs beyond this require user confirmation before truncation. */
export const BYOK_TEXT_HARD_LIMIT = 100_000

/** Fallback for any `runAgent` name not listed in AGENT_TIMEOUT_MS. */
export const DEFAULT_AGENT_TIMEOUT_MS = 60_000

/**
 * Per-agent OpenAI request timeout (ms), keyed by the `name` passed into `runAgent`.
 * `ocr` sends image input, which combined with a slower service tier (e.g. flex) can
 * legitimately take tens of seconds — give it more headroom than the structured-text agents.
 */
export const AGENT_TIMEOUT_MS: Record<string, number> = {
  ocr: 120_000,
}

