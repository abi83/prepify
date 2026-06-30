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

ASSET HINT: Decide if a visual asset would significantly improve this question (e.g. formula, molecule structure, flowchart).
- For math/physics concepts involving equations: set needed=true, type="formula", description=LaTeX description
- For chemistry with structural molecules: set needed=true, type="molecule", description=molecule name + SMILES hint
- For process/classification/hierarchy questions: set needed=true, type="diagram", description of what to diagram
- For most questions (definitions, history, language): set needed=false
- IMPORTANT: The asset can also be an answer option — e.g. "Which formula represents X?" with 4 formulas as options. In that case set needed=true and describe all 4 options in the description field.

VALIDATION (internal before output):
- Exactly 4 answers; ids = {A,B,C,D}
- Exactly one is_correct=true
- Every explanation prefixed correctly

Return JSON: { "content": { "question": "...", "answers": [...], "rationale": "...", "asset_hint": { "needed": false } } }`

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

export async function runSingleChoiceBuilder(
  task: QuestionTask,
  apiKey: string,
  model: string,
  language: string,
  signal?: AbortSignal,
): Promise<AgentResult<{ type: 'single_choice'; content: SingleChoiceContent }>> {
  const langInstruction = language !== 'en' ? `\nRespond in ${language}.` : ''
  const result = await runAgent({
    name: 'SingleChoiceBuilder',
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userPrompt: formatConcepts(task.concepts),
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })
  return { output: { type: 'single_choice', content: result.output.content }, metrics: result.metrics }
}
