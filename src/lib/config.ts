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

