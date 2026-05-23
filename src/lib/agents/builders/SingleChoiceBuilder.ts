import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'
import { singleChoiceContentSchema } from '../../../types/questions'
import type { SingleChoiceContent } from '../../../types/questions'
import type { QuestionTask } from '../../../types/pipeline'

const responseSchema = z.object({ content: singleChoiceContentSchema })

const SYSTEM_PROMPT = `You are an expert exam question writer.
Produce ONE single-choice question (exactly one correct answer) about the provided concept.

QUESTION CONSTRUCTION:
- Stem: Single coherent scenario or task (max 800 chars). Integrate the concept naturally.
- Test understanding and application, not just recognition.

ANSWERS (exactly 4, ids A/B/C/D):
- text: Answer choice (max 300 chars). State the core claim first.
- is_correct: Exactly one is_correct=true.
- explanation: Begins "Correct:" or "Incorrect:", max 250 chars. Explain WHY right/wrong.
- Distractors: Each represents a DISTINCT misconception from the concept's common misconceptions.

RATIONALE (max 240 chars): Briefly justify why the correct answer is right and how each distractor represents a specific misconception.

VALIDATION (internal before output):
- Exactly 4 answers; ids = {A,B,C,D}
- Exactly one is_correct=true
- Every explanation prefixed correctly

Return JSON: { "content": { "question": "...", "answers": [...], "rationale": "..." } }`

export async function runSingleChoiceBuilder(
  task: QuestionTask,
  rawText: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'single_choice'; content: SingleChoiceContent }>> {
  const { concept } = task
  const misconceptions = concept.misconceptions.length > 0
    ? concept.misconceptions.map(m => `- ${m}`).join('\n')
    : '- (none listed)'

  const result = await runAgent({
    name: 'SingleChoiceBuilder',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Source text excerpt:\n${rawText.slice(0, 3000)}\n\nConcept to assess:\nName: ${concept.name}\nDescription: ${concept.description}\nCommon misconceptions:\n${misconceptions}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'single_choice', content: result.output.content }, metrics: result.metrics }
}
