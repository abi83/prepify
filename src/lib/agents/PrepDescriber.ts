import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import type { Concept } from '../../types/pipeline'

const prepDescriptionSchema = z.object({
  description: z.string(),
})

const SYSTEM_PROMPT = `You are an expert curriculum designer.
Given a list of study concepts extracted from educational material, write a short description of this study session.

Requirements:
- 100–200 characters
- One sentence, no trailing period
- Content-focused, informative (e.g. "Covers the causes of the French Revolution, key figures, and the role of Enlightenment ideas")
- No quotes

Return JSON: { "description": "..." }`

export async function runPrepDescriber(
  concepts: Concept[],
  apiKey: string,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ description: string }>> {
  const conceptList = concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 10)
    .map(c => `- ${c.name} (importance: ${c.importance.toFixed(2)})`)
    .join('\n')

  const langInstruction = language !== 'en' ? `\nRespond in ${language}.` : ''

  return runAgent({
    name: 'PrepDescriber',
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userContent: { textContent: `Concepts:\n${conceptList}` },
    schema: prepDescriptionSchema,
    apiKey,
    model,
    signal,
  })
}
