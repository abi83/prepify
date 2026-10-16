import { z } from "zod"

import type { AgentDeps } from "@/core/ports"
import { runAgent, AgentResult } from "@/lib/agent"
import type { Prompt } from "@/lib/prompt"
import type { Concept } from "@/types/pipeline"

const SYSTEM_PROMPT = `You are a deduplication assistant for study material. A prep already stores a set of concepts; a new page has just yielded more.

You will receive a JSON object { "existing": [...], "incoming": [...] }; every concept has fields name and description.

For each incoming concept decide: is the same idea already covered by an existing concept?

RULES:
- "duplicate": an existing concept already covers the idea. Set "duplicateOf" to that existing concept's exact name.
- "new": no existing concept covers it. Set "duplicateOf" to null.
- Compare meaning, not wording. Names may differ in language, phrasing, or specificity (e.g. "Mitose" and "cell division", "DNA-Replikation" and "DNA replication").
- A refinement, restatement or narrower/broader form of an existing concept is a duplicate.
- Related-but-distinct ideas are new.
- When unsure, answer "duplicate": a near-duplicate concept produces near-duplicate questions.
- Use exact name strings from the input — do not paraphrase or invent names.

Return a JSON object: { "decisions": [{ "name": "<incoming name>", "duplicateOf": "<existing name>" | null }, ...] }
Every incoming name must appear exactly once.`

export const prompt: Prompt = { version: "2.0.0", text: SYSTEM_PROMPT }

const mergerResponseSchema = z.object({
  decisions: z.array(z.object({ name: z.string(), duplicateOf: z.string().nullable() })),
})

export interface ConceptVerdict {
  concept: Concept
  /** The stored concept it repeats, or null when it is new. */
  duplicateOfId: string | null
}

/** Compares each incoming concept with the prep's stored concepts. */
export async function runConceptMerger(
  incoming: Concept[],
  existing: (Concept & { id: string })[],
  model: string,
  tier: string,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<AgentResult<ConceptVerdict[]>> {
  const brief = (c: Concept) => ({ name: c.name, description: c.description })

  const result = await runAgent({
    name: "ConceptMerger",
    promptVersion: prompt.version,
    systemPrompt: SYSTEM_PROMPT,
    userContent: { textContent: JSON.stringify({ existing: existing.map(brief), incoming: incoming.map(brief) }) },
    schema: mergerResponseSchema,
    model,
    tier,
    signal,
    deps,
  })

  const idByName = new Map(existing.map(c => [ c.name, c.id ]))
  const duplicateOfByName = new Map(result.output.decisions.map(d => [ d.name, d.duplicateOf ]))

  const output = incoming.map(concept => {
    const duplicateOf = duplicateOfByName.get(concept.name)
    if (duplicateOf === undefined) throw new Error(`ConceptMerger returned no decision for "${concept.name}"`)
    if (duplicateOf === null) return { concept, duplicateOfId: null }
    const duplicateOfId = idByName.get(duplicateOf)
    if (!duplicateOfId) throw new Error(`ConceptMerger marked "${concept.name}" a duplicate of unknown "${duplicateOf}"`)
    return { concept, duplicateOfId }
  })

  return { output, meta: result.meta }
}
