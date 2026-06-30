import type { AssetHint, AssetType } from '../../../types/questions'
import { runFormulaAgent } from './FormulaAgent'
import { runMoleculeAgent } from './MoleculeAgent'
import { runDiagramAgent } from './DiagramAgent'
import type { AgentResult } from '../../agent'

export interface AssetOutput {
  type: AssetType
  blob: string
}

export async function routeAsset(
  hint: AssetHint & { needed: true },
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<AssetOutput>> {
  switch (hint.type) {
    case 'formula': {
      const r = await runFormulaAgent(hint.description, apiKey, model, signal)
      return { output: { type: 'formula', blob: r.output }, metrics: r.metrics }
    }
    case 'molecule': {
      const r = await runMoleculeAgent(hint.description, apiKey, model, signal)
      return { output: { type: 'molecule', blob: r.output }, metrics: r.metrics }
    }
    case 'diagram': {
      const r = await runDiagramAgent(hint.description, apiKey, model, signal)
      return { output: { type: 'diagram', blob: r.output }, metrics: r.metrics }
    }
    case 'table':
    case 'svg':
      // Not yet implemented — skip silently
      return { output: { type: hint.type, blob: '' }, metrics: { latency_ms: 0, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }
  }
}
