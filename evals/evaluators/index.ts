import type { Evaluator } from "@evals/evaluator"

import { ocrEvaluator } from "./ocr"

/** Register an agent's evaluator here. */
const EVALUATORS: Evaluator[] = [ ocrEvaluator ]

export function getEvaluator(agent: string): Evaluator {
  const evaluator = EVALUATORS.find(e => e.agent === agent)
  if (!evaluator) throw new Error(`No evaluator for agent "${agent}". Known: ${EVALUATORS.map(e => e.agent).join(", ")}`)
  return evaluator
}
