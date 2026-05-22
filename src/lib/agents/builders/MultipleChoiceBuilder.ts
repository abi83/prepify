import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'
import { multipleChoiceContentSchema } from '../../../types/questions'
import type { MultipleChoiceContent } from '../../../types/questions'
import type { QuestionTask } from '../../../types/pipeline'

const responseSchema = z.object({ content: multipleChoiceContentSchema })

const SYSTEM_PROMPT = `You are an expert exam question writer.
Produce ONE multiple-choice question (at least two answers correct, at least two incorrect) about the provided concept.

QUESTION CONSTRUCTION:
- Stem: Single coherent scenario (max 800 chars). Integrates the concept naturally.

ANSWERS (4-6 options, ids A/B/C/D/E/F sequential, no gaps):
- text: Answer choice (max 300 chars). State the core claim first.
- is_correct: 2-4 are is_correct=true; 2-3 are is_correct=false.
- explanation: Begins "Correct:" or "Incorrect:", max 250 chars.
- Each incorrect answer represents a DISTINCT misconception.

CORRECTNESS DISTRIBUTION:
- 2-4 correct answers. Vary based on how many valid approaches exist.
- 2-3 incorrect answers. Each a distinct misconception.
- Total: 4-6 options.

RATIONALE (max 240 chars).

VALIDATION (internal before output):
- answers length 4-6; ids sequential from A, no gaps
- Multiple is_correct=true; multiple is_correct=false
- Every explanation prefixed correctly

Return JSON: { "content": { "question": "...", "answers": [...], "rationale": "..." } }`

export async function runMultipleChoiceBuilder(
  task: QuestionTask,
  rawText: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'multiple_choice'; content: MultipleChoiceContent }>> {
  const { concept } = task
  const misconceptions = concept.misconceptions.length > 0
    ? concept.misconceptions.map(m => `- ${m}`).join('\n')
    : '- (none listed)'

  const result = await runAgent({
    name: 'MultipleChoiceBuilder',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Source text excerpt:\n${rawText.slice(0, 3000)}\n\nConcept to assess:\nName: ${concept.name}\nDescription: ${concept.description}\nCommon misconceptions:\n${misconceptions}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'multiple_choice', content: result.output.content }, metrics: result.metrics }
}
