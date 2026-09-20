import { runDiagramAgent } from "./DiagramAgent"
import { runFormulaAgent } from "./FormulaAgent"
import { runMoleculeAgent } from "./MoleculeAgent"
import type { AssetHint, AssetType } from "../../../types/questions"
import type { AgentResult } from "../../agent"
import { EMPTY_AGENT_META } from "../../agent"

export interface AssetOutput {
  type: AssetType
  blob: string
}

export type ActiveAssetHint = AssetHint & { needed: true; type: AssetType; description: string }

export async function routeAsset(
  hint: ActiveAssetHint,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<AssetOutput>> {
  switch (hint.type) {
  case "formula": {
    const r = await runFormulaAgent(hint.description, apiKey, model, signal)
    return { output: { type: "formula", blob: r.output }, meta: r.meta }
  }
  case "molecule": {
    const r = await runMoleculeAgent(hint.description, apiKey, model, signal)
    return { output: { type: "molecule", blob: r.output }, meta: r.meta }
  }
  case "diagram": {
    const r = await runDiagramAgent(hint.description, apiKey, model, signal)
    return { output: { type: "diagram", blob: r.output }, meta: r.meta }
  }
  case "table":
  case "svg":
    // Not yet implemented — skip silently
    return { output: { type: hint.type, blob: "" }, meta: EMPTY_AGENT_META }
  }
}
