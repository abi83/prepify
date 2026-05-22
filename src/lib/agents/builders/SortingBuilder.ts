import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'
import { sortingContentSchema } from '../../../types/questions'
import type { SortingContent } from '../../../types/questions'
import type { QuestionTask } from '../../../types/pipeline'

const responseSchema = z.object({ content: sortingContentSchema })

const SYSTEM_PROMPT = `You are an expert exam question writer specializing in sorting (drag-and-drop) questions.
Produce ONE sorting question with EXACTLY 4 items that must be ordered correctly.

Choose EXACTLY ONE ordering factor (never mix):
- prerequisite dependency order
- chronological workflow order
- risk-mitigation priority
- troubleshooting sequence

CONSTRUCTION:
- question: A scenario requiring ordering by the chosen factor. State what is being ordered and by which factor.
- answers: EXACTLY 4 items, ids A/B/C/D:
  { id, text (verb-led action, max 160 chars), correct_index (1-4, each unique), explanation (max 200 chars, do NOT state the numeric position) }
- correct_index must be a permutation of {1,2,3,4}. Each value used exactly once.
- Make at least two items "tempting to mis-order" — clear but non-obvious distractor effect.

RATIONALE (max 240 chars): Justify the ordering and mention why at least one plausible wrong order fails.

VALIDATION (internal before output):
- answers length == 4; ids == {A,B,C,D}
- correct_index covers {1,2,3,4} exactly once

Return JSON: { "content": { "question": "...", "answers": [...], "rationale": "..." } }`

export async function runSortingBuilder(
  task: QuestionTask,
  rawText: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'sorting'; content: SortingContent }>> {
  const { concept } = task
  const misconceptions = concept.misconceptions.length > 0
    ? concept.misconceptions.map(m => `- ${m}`).join('\n')
    : '- (none listed)'

  const result = await runAgent({
    name: 'SortingBuilder',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Source text excerpt:\n${rawText.slice(0, 3000)}\n\nConcept to assess:\nName: ${concept.name}\nDescription: ${concept.description}\nCommon misconceptions:\n${misconceptions}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'sorting', content: result.output.content }, metrics: result.metrics }
}
