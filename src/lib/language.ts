import type { SupportedLanguage } from "./config"

/** The one language shared by `items`; throws on none or on a mix. */
export function resolveLanguage(items: { language: SupportedLanguage }[]): SupportedLanguage {
  if (items.length === 0) throw new Error("Cannot resolve a language from no inputs")
  const languages = [ ...new Set(items.map(item => item.language)) ]
  if (languages.length > 1) throw new Error(`Inputs span more than one language: ${languages.join(", ")}`)
  return languages[0]
}
