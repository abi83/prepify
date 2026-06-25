import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import type { Concept } from '../../types/pipeline'

const prepNameSchema = z.object({
  title: z.string(),
})

const SYSTEM_PROMPT = `You are an expert curriculum designer.
Given a list of study concepts extracted from educational material, generate a short, descriptive title for this study session.

Requirements:
- Maximum 5 words
- No quotes or punctuation at the end
- Exam-style, content-focused (e.g. "Mitosis and Cell Division", "Supply and Demand Basics", "French Revolution Causes")
- Reflects the most important concepts

Return JSON: { "title": "..." }`

export async function runPrepNamer(
  concepts: Concept[],
  apiKey: string,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ title: string }>> {
  const conceptList = concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8)
    .map(c => `- ${c.name} (importance: ${c.importance.toFixed(2)})`)
    .join('\n')

  const langInstruction = language !== 'en' ? `\nRespond in ${language}.` : ''

  return runAgent({
    name: 'PrepNamer',
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userPrompt: `Concepts:\n${conceptList}`,
    schema: prepNameSchema,
    apiKey,
    model,
    signal,
  })
}
