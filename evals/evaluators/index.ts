import type { Evaluator } from "@evals/evaluator"

import { ocrTextEvaluator } from "./ocrText"
import { ocrVisualElementsEvaluator } from "./ocrVisualElements"
import { prepMetaEvaluator } from "./prepMeta"

/** Register an agent's evaluators here, one per metric. */
const EVALUATORS: Evaluator[] = [ ocrTextEvaluator, ocrVisualElementsEvaluator, prepMetaEvaluator ]

export function getEvaluator(agent: string, metric: string): Evaluator {
  const evaluator = EVALUATORS.find(e => e.agent === agent && e.metric === metric)
  if (!evaluator) throw new Error(`No evaluator for agent "${agent}", metric "${metric}". Known: ${EVALUATORS.map(e => `${e.agent}/${e.metric}`).join(", ")}`)
  return evaluator
}
