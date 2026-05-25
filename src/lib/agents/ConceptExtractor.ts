import { runAgent, AgentResult } from '../agent'
import { conceptsResponseSchema } from '../../types/pipeline'
import type { Concept } from '../../types/pipeline'
import { chunkText } from '../chunkText'
import { CHUNK_SIZE, CHUNK_OVERLAP } from '../config'

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
  const chunks = chunkText(rawText, CHUNK_SIZE, CHUNK_OVERLAP)

  let totalTokens = { latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  const allConcepts: Concept[] = []

  for (const chunk of chunks) {
    const result = await runAgent({
      name: 'ConceptExtractor',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: `Source text:\n\n${chunk}`,
      schema: conceptsResponseSchema,
      apiKey,
      model,
      signal,
    })
    allConcepts.push(...result.output.concepts)
    totalTokens = {
      latency_ms: totalTokens.latency_ms + result.metrics.latency_ms,
      prompt_tokens: totalTokens.prompt_tokens + result.metrics.prompt_tokens,
      completion_tokens: totalTokens.completion_tokens + result.metrics.completion_tokens,
      total_tokens: totalTokens.total_tokens + result.metrics.total_tokens,
    }
  }

  return { output: allConcepts, metrics: totalTokens }
}
