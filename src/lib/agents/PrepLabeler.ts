import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import type { Concept } from '../../types/pipeline'

const DISCIPLINES = [
  'History',
  'Geography',
  'Literature',
  'Languages',
  'Social Studies',
  'Economics',
  'Philosophy/Ethics',
  'Biology',
  'Chemistry',
  'Physics',
  'Mathematics',
  'Computer Science',
] as const

export type Discipline = (typeof DISCIPLINES)[number]

const prepLabelSchema = z.object({
  grade: z.number().int().min(1).max(13).nullable(),
  discipline: z.enum(DISCIPLINES).nullable(),
  confidence: z.number().min(0).max(1),
})

export type PrepLabel = z.infer<typeof prepLabelSchema>

const SYSTEM_PROMPT = `You are a school curriculum specialist.
Given a list of study concepts extracted from educational material, determine:
1. The school grade level (1–13, where 1 is first grade and 13 is the final pre-university year)
2. The school subject discipline from the allowed list

Allowed disciplines: History, Geography, Literature, Languages, Social Studies, Economics, Philosophy/Ethics, Biology, Chemistry, Physics, Mathematics, Computer Science

Rules:
- Only return a discipline if the material clearly belongs to a school curriculum subject
- Return null for both grade and discipline if the content is not school curriculum material (phone bills, fiction, recipes, business documents, etc.)
- Assign confidence 0.0–1.0: high (>0.8) when subject and grade are obvious, low (<0.5) when uncertain
- For mixed or unclear content that could be school-related, still assign low confidence rather than null
- Grade should reflect the typical year students encounter this content

Return JSON: { "grade": <integer 1–13 or null>, "discipline": <discipline string or null>, "confidence": <float 0.0–1.0> }`

export async function runPrepLabeler(
  concepts: Concept[],
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<PrepLabel>> {
  const conceptList = concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 12)
    .map(c => `- ${c.name} (importance: ${c.importance.toFixed(2)}): ${c.description}`)
    .join('\n')

  return runAgent({
    name: 'PrepLabeler',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Concepts:\n${conceptList}`,
    schema: prepLabelSchema,
    apiKey,
    model,
    signal,
  })
}
