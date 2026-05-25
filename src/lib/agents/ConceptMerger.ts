import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import type { Concept } from '../../types/pipeline'

const SYSTEM_PROMPT = `You are a deduplication assistant for concept lists extracted from study material.

You will receive a JSON array of concepts with fields: name, importance.
These were extracted from different sections of the same text, so some may refer to the same concept under different names or phrasings (e.g. "Mitose" and "cell division", "DNA-Replikation" and "DNA replication").

Your task: group concepts that refer to the same underlying idea.

RULES:
- Each concept belongs to exactly one group
- A concept that has no duplicates forms a singleton group ["Mitose"]
- Concepts in the same group must genuinely mean the same thing — do not merge related-but-distinct concepts
- Names may differ in language, phrasing, or specificity — use semantic meaning, not surface similarity
- Use the exact name strings from the input — do not paraphrase or invent new names

Return a JSON object: { "groups": [["Mitose", "cell division"], ["DNA replication"], ...] }
Every input name must appear in exactly one group.`

const mergerResponseSchema = z.object({
  groups: z.array(z.array(z.string())),
})

export async function runConceptMerger(
  concepts: Concept[],
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<Concept[]>> {
  if (concepts.length === 0) return { output: [], metrics: { latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }

  const nameSet = new Set(concepts.map(c => c.name))
  const payload = concepts.map(c => ({ name: c.name, importance: c.importance }))

  const result = await runAgent({
    name: 'ConceptMerger',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify(payload),
    schema: mergerResponseSchema,
    apiKey,
    model,
    signal,
  })

  const conceptByName = new Map(concepts.map(c => [c.name, c]))

  const merged: Concept[] = result.output.groups.flatMap(group => {
    const members = group.flatMap(name => {
      if (!nameSet.has(name)) {
        console.warn(`[ConceptMerger] unmatched name in response, skipping: "${name}"`)
        return []
      }
      return [conceptByName.get(name)!]
    })
    if (members.length === 0) return []
    return [members.reduce((best, c) => (c.importance > best.importance ? c : best), members[0])]
  })

  return { output: merged, metrics: result.metrics }
}
