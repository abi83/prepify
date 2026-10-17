import type { AgentDeps } from "@/core/ports"
import type { AgentResult } from "@/lib/agent"
import { EMPTY_AGENT_META } from "@/lib/agent"
import type { AssetOutput } from "@/types/jobOutputs"
import type { ActiveAssetHint } from "@/types/questions"

import { runDiagramAgent } from "./DiagramAgent"
import { runFormulaAgent } from "./FormulaAgent"
import { runMoleculeAgent } from "./MoleculeAgent"

export async function routeAsset(
  hint: ActiveAssetHint,
  model: string,
  tier: string,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<AgentResult<AssetOutput>> {
  switch (hint.type) {
  case "formula": {
    const r = await runFormulaAgent(hint.description, model, tier, signal, deps)
    return { output: { type: "formula", blob: r.output }, meta: r.meta }
  }
  case "molecule": {
    const r = await runMoleculeAgent(hint.description, model, tier, signal, deps)
    return { output: { type: "molecule", blob: r.output }, meta: r.meta }
  }
  case "diagram": {
    const r = await runDiagramAgent(hint.description, model, tier, signal, deps)
    return { output: { type: "diagram", blob: r.output }, meta: r.meta }
  }
  case "table":
  case "svg":
    // Not yet implemented — skip silently
    return { output: { type: hint.type, blob: "" }, meta: EMPTY_AGENT_META }
  }
}
