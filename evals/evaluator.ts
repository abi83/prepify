import { z } from "zod"

import type { StoredSample } from "@/core/sampler"
import type { AgentInput } from "@/lib/agent"

export const verdictSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
})

export type Verdict = z.infer<typeof verdictSchema>

/** Judges one sample of `agent`; its identity is the hash of `systemPrompt`. */
export interface Evaluator {
  agent: string
  systemPrompt: string
  /** What the judge sees: the sample's input and output. */
  buildJudgeInput(sample: StoredSample): AgentInput
}
