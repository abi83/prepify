import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import type { Concept } from '../../types/pipeline'

const SYSTEM_PROMPT = `You are a deduplication assistant for concept lists extracted from study material.

You will receive a JSON array of concepts with fields: index, name, importance.
These were extracted from different sections of the same text, so some may refer to the same concept under different names or phrasings (e.g. "Mitose" and "cell division", "DNA-Replikation" and "DNA replication").

Your task: group concepts that refer to the same underlying idea.

RULES:
- Each concept belongs to exactly one group
- A concept that has no duplicates forms a singleton group [index]
- Concepts in the same group must genuinely mean the same thing — do not merge related-but-distinct concepts
- Names may differ in language, phrasing, or specificity — use semantic meaning, not surface similarity

Return a JSON object: { "groups": [[0, 3], [1], [2, 4], ...] }
Every input index must appear in exactly one group.`

const mergerResponseSchema = z.object({
  groups: z.array(z.array(z.number().int().nonnegative())),
})

type MergerInput = { index: number; name: string; importance: number }

export async function runConceptMerger(
  concepts: Concept[],
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<Concept[]>> {
  if (concepts.length === 0) return { output: [], metrics: { latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }

  const payload: MergerInput[] = concepts.map((c, i) => ({ index: i, name: c.name, importance: c.importance }))

  const result = await runAgent({
    name: 'ConceptMerger',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify(payload),
    schema: mergerResponseSchema,
    apiKey,
    model,
    signal,
  })

  const merged: Concept[] = result.output.groups.map(group => {
    // Pick the concept with the highest importance score from each group
    const members = group
      .filter(i => i >= 0 && i < concepts.length)
      .map(i => concepts[i])
    return members.reduce((best, c) => (c.importance > best.importance ? c : best), members[0])
  })

  return { output: merged, metrics: result.metrics }
}
