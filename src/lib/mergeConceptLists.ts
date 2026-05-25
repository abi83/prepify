import type { Concept } from '../types/pipeline'

/**
 * Normalizes a concept name for exact-match deduplication.
 * Unicode-safe: works across Latin, Cyrillic, and other scripts.
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Removes exact-match duplicates from a flat concept list.
 * When two concepts share a normalized name, keeps the one with higher importance.
 * This runs before the LLM merger to eliminate the trivial case (same concept
 * extracted verbatim from the chunk overlap region) at zero cost.
 */
export function deduplicateExact(concepts: Concept[]): Concept[] {
  const seen = new Map<string, Concept>()

  for (const concept of concepts) {
    const key = normalizeName(concept.name)
    const existing = seen.get(key)
    if (!existing || concept.importance > existing.importance) {
      seen.set(key, concept)
    }
  }

  return Array.from(seen.values())
}
