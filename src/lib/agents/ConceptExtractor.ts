import { runAgent, AgentResult } from '../agent'
import { conceptsResponseSchema } from '../../types/pipeline'
import type { Concept } from '../../types/pipeline'
import { CHUNK_SIZE } from '../config'
import type { Page } from '../supabase'

const SYSTEM_PROMPT = `You are a specialized concept extraction assistant for test preparation systems.

A concept is assessable if it:
1. Can be TESTED in an exam question (knowledge, application, or analysis)
2. Represents the KNOWLEDGE that students must understand
3. Appears in the provided text — NO hallucination

EXTRACTION RULES:
- Extract every concept worth testing a student on — do not aim for a specific count
- Focus on: facts, definitions, processes, mechanisms, relationships, principles
- Assign each concept an importance score (0.0–1.0) reflecting how central it is to the material
- Include 0-3 misconceptions per concept (can be empty list)
- If the text contains no assessable concepts, return an empty list

AVOID REDUNDANCY:
- Before adding a concept, check if it is already fully covered as a sub-point of a broader concept you've already listed — if so, skip it
- Prefer one broader concept over two narrow overlapping ones
- Do not extract the same idea twice under different names

DESCRIPTIONS:
- 1–2 sentences maximum
- State what the concept is and why it matters for understanding the material
- Do not restate the source text verbatim or list every detail — focus on what makes it testable

MISCONCEPTIONS:
- Each misconception must be FACTUALLY INCORRECT
- Must represent a plausible error a student could genuinely hold — not a trivial logical negation ("X does not exist" or "X never happens" are not misconceptions)
- Good misconceptions reflect confusion between related concepts, common overgeneralizations, or subtle errors in reasoning

IMPORTANCE SCORING:
- 0.8–1.0: Core concepts; without these the material cannot be understood
- 0.5–0.8: Important supporting concepts
- 0.2–0.5: Secondary details worth knowing
- 0.0–0.2: Edge cases, minor details

NOT ASSESSABLE (skip):
- Meta-information about the document itself (page numbers, headers, footnotes)
- Instructions, exam logistics, scoring rubrics
- Unrelated asides or parenthetical remarks

Return a JSON object: { "concepts": [ { "name": "...", "description": "...", "importance": 0.0–1.0, "misconceptions": ["..."] } ] }
The list will be capped at 20 entries — prioritise by importance if you have more.`

export interface ConceptExtractorResult extends AgentResult<Concept[]> {
  chunkCount: number
}

function serializePage(page: Page): string {
  const parts = [`=== Page ${page.page} ===\n${page.text}`]
  if (page.visual_elements.length > 0) {
    const visuals = page.visual_elements.map((el, i) => {
      const lines = [`[Visual ${i + 1}] Type: ${el.type}`, `Description: ${el.description}`]
      if (el.content) lines.push(`Content: ${el.content}`)
      if (el.caption) lines.push(`Caption: ${el.caption}`)
      if (el.context) lines.push(`Referenced by: ${el.context}`)
      return lines.join('\n')
    })
    parts.push(`--- Visual Elements ---\n${visuals.join('\n\n')}`)
  }
  return parts.join('\n\n')
}

function chunkPages(pages: Page[], chunkSize: number): string[] {
  const chunks: string[] = []
  let current = ''

  for (const page of pages) {
    const serialized = serializePage(page)
    if (current.length > 0 && current.length + serialized.length + 2 > chunkSize) {
      chunks.push(current)
      current = serialized
    } else {
      current = current.length > 0 ? current + '\n\n' + serialized : serialized
    }
  }

  if (current.length > 0) chunks.push(current)
  return chunks.length > 0 ? chunks : ['']
}

export async function runConceptExtractor(
  pages: Page[],
  apiKey: string,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<ConceptExtractorResult> {
  const chunks = chunkPages(pages, CHUNK_SIZE)
  const langInstruction = language !== 'en' ? `\nRespond in the same language as the source text (${language}).` : ''

  let totalTokens = { latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  const allConcepts: Concept[] = []

  for (const chunk of chunks) {
    const result = await runAgent({
      name: 'ConceptExtractor',
      systemPrompt: SYSTEM_PROMPT + langInstruction,
      userPrompt: `Source text:\n\n${chunk}`,
      schema: conceptsResponseSchema,
      apiKey,
      model,
      signal,
    })
    const filtered = result.output.concepts.filter(c => c.importance >= 0.5)
    allConcepts.push(...filtered)
    totalTokens = {
      latency_ms: totalTokens.latency_ms + result.metrics.latency_ms,
      prompt_tokens: totalTokens.prompt_tokens + result.metrics.prompt_tokens,
      completion_tokens: totalTokens.completion_tokens + result.metrics.completion_tokens,
      total_tokens: totalTokens.total_tokens + result.metrics.total_tokens,
    }
  }

  return { output: allConcepts, metrics: totalTokens, chunkCount: chunks.length }
}
