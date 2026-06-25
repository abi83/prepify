import { z } from 'zod'
import { runAgent, AgentResult } from '../agent'
import { generatedQuestionSchema } from '../../types/questions'
import type { GeneratedQuestion } from '../../types/questions'
import type { Concept } from '../../types/pipeline'

const reviewerResponseSchema = z.object({
  question: generatedQuestionSchema.nullable(),
})

const SYSTEM_PROMPT = `You are an expert study question reviewer.
Review the provided study question and check:

1. Clarity: Is the question unambiguous and well-formed? No trailing text corruption?
2. Correctness: Are the correct answers actually correct?
3. Quality: Does it test real understanding, not just memorization?
4. Format integrity:
   - fill_the_gap: {{gap:N}} markers must match the gaps array exactly
   - sorting: correct_index must be a permutation of {1,2,3,4}
   - single_choice: exactly one is_correct=true with 4 answers
   - multiple_choice: 2-4 correct, 2-3 incorrect, 4-6 total

Fix any issues you find. Return the corrected question in the same JSON structure.
If the question is fundamentally broken (wrong facts, unfixable format), return null.

Return JSON: { "question": <corrected question object or null> }`

function formatConcepts(concepts: Concept[]): string {
  if (concepts.length === 1) {
    const c = concepts[0]
    return `Concept being assessed:\nName: ${c.name}\nDescription: ${c.description}`
  }
  return `Concepts being assessed:\n` +
    concepts.map((c, i) => `Concept ${i + 1}: ${c.name}\nDescription: ${c.description}`).join('\n\n')
}

export async function runQuestionReviewer(
  question: GeneratedQuestion,
  concepts: Concept[],
  apiKey: string,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ question: GeneratedQuestion | null }>> {
  const langInstruction = language !== 'en' ? `\nAll question text must be in ${language}.` : ''
  try {
    return await runAgent({
      name: 'QuestionReviewer',
      systemPrompt: SYSTEM_PROMPT + langInstruction,
      userPrompt: `${formatConcepts(concepts)}\n\nQuestion to review:\n${JSON.stringify(question, null, 2)}`,
      schema: reviewerResponseSchema,
      apiKey,
      model,
      signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    // Reviewer failed — pass the original question through rather than losing it
    return {
      output: { question },
      metrics: { latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    }
  }
}
