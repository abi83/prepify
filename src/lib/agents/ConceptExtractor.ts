import { runAgent, AgentResult } from '../agent'
import { conceptsResponseSchema } from '../../types/pipeline'
import type { Concept } from '../../types/pipeline'

const SYSTEM_PROMPT = `You are a specialized concept extraction assistant for test preparation systems.

A concept is assessable if it:
1. Can be TESTED in an exam question (knowledge, application, or analysis)
2. Represents the KNOWLEDGE that students must understand
3. Appears in the provided text — NO hallucination

EXTRACTION RULES:
- Extract 5-15 key concepts worth testing a student on
- Focus on: facts, definitions, processes, mechanisms, relationships, principles
- Assign each concept an importance score (0.0–1.0) reflecting how central it is to the material
- Include 1-3 common misconceptions per concept for use in question distractors (can be empty list)

IMPORTANCE SCORING:
- 0.8–1.0: Core concepts; without these the material cannot be understood
- 0.5–0.8: Important supporting concepts
- 0.2–0.5: Secondary details worth knowing
- 0.0–0.2: Edge cases, minor details

NOT ASSESSABLE (skip):
- Meta-information about the document itself (page numbers, headers, footnotes)
- Instructions, exam logistics, scoring rubrics
- Unrelated asides or parenthetical remarks

Return a JSON object: { "concepts": [ { "name": "...", "description": "...", "importance": 0.0–1.0, "misconceptions": ["..."] } ] }`

export async function runConceptExtractor(
  rawText: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<Concept[]>> {
  const result = await runAgent({
    name: 'ConceptExtractor',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Source text:\n\n${rawText.slice(0, 8000)}`,
    schema: conceptsResponseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: result.output.concepts, metrics: result.metrics }
}
