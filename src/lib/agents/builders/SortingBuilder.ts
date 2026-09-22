import { z } from "zod"

import { runAgent, AgentResult } from "@/lib/agent"
import type { Logger } from "@/lib/logger"
import type { QuestionTask } from "@/types/pipeline"
import { sortingContentSchema } from "@/types/questions"
import type { SortingContent } from "@/types/questions"

import { difficultyInstructions } from "./difficulty"
import { rewriteInstructions, type RewriteInput } from "./rewrite"

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

ASSET HINT: Decide if a visual asset would improve this question.
- For process/pipeline flowcharts: type="diagram"
- For most sorting questions: needed=false

VALIDATION (internal before output):
- answers length == 4; ids == {A,B,C,D}
- correct_index covers {1,2,3,4} exactly once

Return JSON: { "content": { "question": "...", "answers": [...], "rationale": "...", "asset_hint": { "needed": false, "type": null, "description": null } } }`

function formatConcepts(concepts: QuestionTask["concepts"]): string {
  if (concepts.length === 1) {
    const c = concepts[0]
    const mis = c.misconceptions.length > 0 ? c.misconceptions.map(m => `- ${m}`).join("\n") : "- (none listed)"
    return `Concept to assess:\nName: ${c.name}\nDescription: ${c.description}\nCommon misconceptions:\n${mis}`
  }
  return "Concepts to assess (connect or contrast them in your question):\n\n" +
    concepts.map((c, i) => {
      const mis = c.misconceptions.length > 0 ? c.misconceptions.map(m => `- ${m}`).join("\n") : "- (none listed)"
      return `Concept ${i + 1}: ${c.name}\nDescription: ${c.description}\nCommon misconceptions:\n${mis}`
    }).join("\n\n")
}

export async function runSortingBuilder(
  task: QuestionTask,
  apiKey: string,
  model: string,
  language: string,
  signal: AbortSignal,
  rewrite: RewriteInput | undefined,
  logger: Logger,
): Promise<AgentResult<{ type: "sorting"; content: SortingContent }>> {
  const langInstruction = language !== "en" ? `\nRespond in ${language}.` : ""
  const result = await runAgent({
    name: "SortingBuilder",
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userContent: { textContent: `${formatConcepts(task.concepts)}\n\n${difficultyInstructions(task, "no-distractors")}${rewriteInstructions(rewrite)}` },
    schema: responseSchema,
    apiKey,
    model,
    signal,
    logger,
  })
  return { output: { type: "sorting", content: result.output.content }, meta: result.meta }
}
