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

function formatConcepts(concepts: QuestionTask['concepts']): string {
  if (concepts.length === 1) {
    const c = concepts[0]
    const mis = c.misconceptions.length > 0 ? c.misconceptions.join('; ') : 'none listed'
    return `Concept to assess:\nName: ${c.name}\nDescription: ${c.description}\nCommon misconceptions: ${mis}`
  }
  return `Concepts to assess (connect or contrast them in your question):\n\n` +
    concepts.map((c, i) => {
      const mis = c.misconceptions.length > 0 ? c.misconceptions.join('; ') : 'none listed'
      return `Concept ${i + 1}: ${c.name}\nDescription: ${c.description}\nCommon misconceptions: ${mis}`
    }).join('\n\n')
}

export async function runFlashcardBuilder(
  task: QuestionTask,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'flashcard'; content: FlashcardContent }>> {
  const result = await runAgent({
    name: 'FlashcardBuilder',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: formatConcepts(task.concepts),
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'flashcard', content: result.output.content }, metrics: result.metrics }
}
