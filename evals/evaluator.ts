import { z } from "zod"

import type { StoredSample } from "@/core/sampler"
import type { AgentInput } from "@/lib/agent"
import type { Prompt } from "@/lib/prompt"

export const verdictSchema = z.object({
  score: z.number().min(0).max(1),
  reasoning: z.string(),
})

export type Verdict = z.infer<typeof verdictSchema>

/** Judges one `metric` of one sample of `agent`; its identity is `prompt`'s id, version and hash. */
export interface Evaluator {
  agent: string
  /** What this judge measures; an agent has one evaluator per metric, each seeing only the slice of output it scores. */
  metric: string
  /** The validated judge model; changing it needs a new validation, so it lives here, not in the experiment. */
  llm: { model: string; tier: string }
  prompt: Prompt
  /** What the judge sees: the sample's input and output. */
  buildJudgeInput(sample: StoredSample): AgentInput
}
