import { z } from "zod"

import { runAgent, AgentResult, EMPTY_AGENT_META } from "@/lib/agent"
import type { Logger } from "@/lib/logger"
import type { Concept } from "@/types/pipeline"

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
  language: string,
  signal: AbortSignal,
  logger: Logger,
): Promise<AgentResult<Concept[]>> {
  if (concepts.length === 0) return { output: [], meta: EMPTY_AGENT_META }

  const nameSet = new Set(concepts.map(c => c.name))
  const payload = concepts.map(c => ({ name: c.name, importance: c.importance }))
  const langInstruction = language !== "en" ? `\nRespond in the same language as the concept names (${language}).` : ""

  const result = await runAgent({
    name: "ConceptMerger",
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userContent: { textContent: JSON.stringify(payload) },
    schema: mergerResponseSchema,
    apiKey,
    model,
    signal,
    logger,
  })

  const conceptByName = new Map(concepts.map(c => [ c.name, c ]))

  const merged: Concept[] = result.output.groups.flatMap(group => {
    const members = group.flatMap(name => {
      if (!nameSet.has(name)) {
        logger.warn("ConceptMerger: unmatched name in response, skipping", { name })
        return []
      }
      return [ conceptByName.get(name)! ]
    })
    if (members.length === 0) return []
    return [ members.reduce((best, c) => (c.importance > best.importance ? c : best), members[0]) ]
  })

  return { output: merged, meta: result.meta }
}
