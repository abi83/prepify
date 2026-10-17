export const SUPPORTED_LANGUAGES = [ "en", "de", "fr", "it", "es", "pl", "nl", "pt", "ru", "uk" ] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
