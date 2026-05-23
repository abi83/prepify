import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'
import { flashcardContentSchema } from '../../../types/questions'
import type { FlashcardContent } from '../../../types/questions'
import type { QuestionTask } from '../../../types/pipeline'

const responseSchema = z.object({ content: flashcardContentSchema })

const SYSTEM_PROMPT = `You are an expert curriculum designer generating a high-quality flashcard for exam preparation.
Create EXACTLY ONE flashcard based on the provided concept.

Instructions:
1. Front (The Scenario): Provide a scenario or definition and ask the user to identify a specific feature, term, or mechanism.
   BAD: "What is [Concept Name]?"
   GOOD: "What feature allows you to [Action]?" or "Which mechanism is responsible for [Action]?"
2. Back Answer: ONLY the exact term, command, or feature name (1-5 words). NOT a full sentence.
3. Back Explanation: A single punchy sentence reinforcing WHY the back answer is correct (maximum 15 words).

CRITICAL for Brevity:
- front: maximum 20 words. Strip all filler.
- back_explanation: maximum 15 words. One sentence.

Return JSON: { "content": { "front": "...", "back": "...", "back_explanation": "..." } }`

export async function runFlashcardBuilder(
  task: QuestionTask,
  rawText: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'flashcard'; content: FlashcardContent }>> {
  const { concept } = task
  const misconceptions = concept.misconceptions.length > 0
    ? concept.misconceptions.join('; ')
    : 'none listed'

  const result = await runAgent({
    name: 'FlashcardBuilder',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Source text excerpt:\n${rawText.slice(0, 2000)}\n\nConcept to assess:\nName: ${concept.name}\nDescription: ${concept.description}\nCommon misconceptions: ${misconceptions}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'flashcard', content: result.output.content }, metrics: result.metrics }
}
