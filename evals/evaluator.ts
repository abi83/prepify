import { z } from "zod"

import type { StoredSample } from "@/core/sampler"
import type { AgentInput } from "@/lib/agent"
import type { Prompt } from "@/lib/prompt"

export const verdictSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
})

export type Verdict = z.infer<typeof verdictSchema>

/** Judges one sample of `agent`; its identity is `prompt`'s id, version and hash. */
export interface Evaluator {
  agent: string
  prompt: Prompt
  /** What the judge sees: the sample's input and output. */
  buildJudgeInput(sample: StoredSample): AgentInput
}
