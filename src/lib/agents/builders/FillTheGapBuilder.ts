import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'
import { fillTheGapContentSchema } from '../../../types/questions'
import type { FillTheGapContent } from '../../../types/questions'
import type { QuestionTask } from '../../../types/pipeline'

const responseSchema = z.object({ content: fillTheGapContentSchema })

const SYSTEM_PROMPT = `You are an expert exam question writer.
Produce ONE fill-the-gap (cloze) question about the provided concept.

CRITICAL: Gaps MUST be marked with the EXACT tokens {{gap:1}}, {{gap:2}}, etc.
Do NOT use underscores (___), blanks, or any other placeholder. ONLY {{gap:1}}, {{gap:2}}, etc.
Example valid question: "The heart pumps blood through the {{gap:1}} and {{gap:2}} circuits."

CONSTRUCTION:
- question: A coherent sentence or short paragraph containing 2-4 gap tokens (consecutive indexes starting from 1). Must read naturally.
- gaps (2-4, index from 1): { index, correct_answer_id, explanation (max 150 chars) }
- answers (4-6): { id (slugified label), label (max 35 chars), multiple_usage (bool) }
  - Set multiple_usage=true only if the same answer legitimately fills 2+ gaps.
  - Include quality distractors representing common misconceptions from the concept.

VALIDATION (internal before output):
- Count {{gap:N}} tokens in question — must equal gaps.length
- Every gap.correct_answer_id must exist in answers array
- answers length 4-6; gaps length 2-4

RATIONALE (max 300 chars).

Return JSON: { "content": { "question": "...", "gaps": [...], "answers": [...], "rationale": "..." } }`

function formatConcepts(concepts: QuestionTask['concepts']): string {
  if (concepts.length === 1) {
    const c = concepts[0]
    const mis = c.misconceptions.length > 0 ? c.misconceptions.map(m => `- ${m}`).join('\n') : '- (none listed)'
    return `Concept to assess:\nName: ${c.name}\nDescription: ${c.description}\nCommon misconceptions:\n${mis}`
  }
  return `Concepts to assess (connect or contrast them in your question):\n\n` +
    concepts.map((c, i) => {
      const mis = c.misconceptions.length > 0 ? c.misconceptions.map(m => `- ${m}`).join('\n') : '- (none listed)'
      return `Concept ${i + 1}: ${c.name}\nDescription: ${c.description}\nCommon misconceptions:\n${mis}`
    }).join('\n\n')
}

export async function runFillTheGapBuilder(
  task: QuestionTask,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'fill_the_gap'; content: FillTheGapContent }>> {
  const result = await runAgent({
    name: 'FillTheGapBuilder',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: formatConcepts(task.concepts),
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'fill_the_gap', content: result.output.content }, metrics: result.metrics }
}
