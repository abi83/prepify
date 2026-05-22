import { runAgent, AgentResult } from '../agent'
import { prepContextSchema, PrepContext } from '../../types/questions'

const SYSTEM_PROMPT = `You are an expert curriculum designer.
Given a raw text extracted from a textbook or study material, produce a concise study guide title and a 2-3 sentence description that captures what the material is about and what a student will learn from it.

Rules:
- title: short, exam-style name (e.g. "Chapter 5: Cell Division" or "Introduction to Supply and Demand"). Max 10 words.
- description: 2-3 sentences. Cover the main topics and why they matter for study. No filler phrases like "This material covers...".
- Return ONLY valid JSON with exactly two fields: title, description.`

export async function runPrepContextAgent(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<AgentResult<PrepContext>> {
  return runAgent({
    name: 'PrepContextAgent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Raw text:\n\n${rawText.slice(0, 6000)}`,
    schema: prepContextSchema,
    apiKey,
    signal,
  })
}
