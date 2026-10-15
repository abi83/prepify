import { z } from "zod"

import type { AgentDeps } from "@/core/ports"
import { runAgent, AgentResult } from "@/lib/agent"
import type { Prompt } from "@/lib/prompt"
import type { Concept } from "@/types/pipeline"

const prepNameSchema = z.object({
  title: z.string(),
  description: z.string().min(50).max(350),
})

const SYSTEM_PROMPT = `You are an expert curriculum designer.
Given a list of study concepts extracted from educational material, generate a title and a short description for this study session.

Title requirements:
- Maximum 5 words
- No quotes or punctuation at the end
- Exam-style, content-focused (e.g. "Mitosis and Cell Division", "Supply and Demand Basics", "French Revolution Causes")
- Reflects the most important concepts

Description requirements:
- 50–350 characters, one sentence
- Content-focused, informative (e.g. "Covers the causes of the French Revolution, key figures, and the role of Enlightenment ideas")

Return JSON: { "title": "...", "description": "..." }`

export const prompt: Prompt = { version: "1.0.0", text: SYSTEM_PROMPT }

export async function runPrepNamer(
  concepts: Concept[],
  model: string,
  tier: string,
  language: string,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<AgentResult<{ title: string; description: string }>> {
  const conceptList = concepts
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 8)
    .map(c => `- ${c.name} (importance: ${c.importance.toFixed(2)})`)
    .join("\n")

  const langInstruction = language !== "en" ? `\nRespond in ${language}.` : ""

  return runAgent({
    name: "PrepNamer",
    promptVersion: prompt.version,
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userContent: { textContent: `Concepts:\n${conceptList}` },
    schema: prepNameSchema,
    model,
    tier,
    signal,
    deps,
  })
}
