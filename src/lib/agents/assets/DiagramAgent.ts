import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'

const diagramTypeSchema = z.enum(['flowchart', 'graph'])

const responseSchema = z.object({
  type: diagramTypeSchema,
  dsl: z.string(),
})

const SYSTEM_PROMPT = `You are an expert at creating Mermaid diagrams for school-level study materials.
Given a description, output a Mermaid DSL string for either a flowchart or a classification/hierarchy graph.

Rules:
- Choose type="flowchart" for processes, workflows, decision trees, lifecycle diagrams.
- Choose type="graph" for classification hierarchies, taxonomy trees, mind-maps represented as graphs.
- Use clear, concise node labels (max 40 chars per node).
- Keep the diagram focused: 4-10 nodes maximum for readability.
- For flowchart: use "flowchart TD" direction.
- For graph: use "graph TD" direction.
- Use classDef sparingly — only if it adds clarity.
- Do NOT include markdown fences (\`\`\`mermaid ... \`\`\`) — output only the raw DSL.
- Escape special characters in node labels with quotes when needed.

Example flowchart DSL (raw, no fences):
flowchart TD
  A["Step 1"] --> B["Step 2"]
  B --> C{"Decision?"}
  C -- Yes --> D["Outcome A"]
  C -- No --> E["Outcome B"]

Return JSON: { "type": "flowchart", "dsl": "flowchart TD\\n  ..." }`

const beautifulMermaidEsm = 'https://esm.sh/beautiful-mermaid@1.1.3'

export async function runDiagramAgent(
  description: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<string>> {
  const result = await runAgent({
    name: 'DiagramAgent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Generate a Mermaid diagram for: ${description}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })

  const blob = buildDiagramBlob(result.output.dsl)
  return { output: blob, metrics: result.metrics }
}

function buildDiagramBlob(dsl: string): string {
  const escapedDsl = dsl
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  html,body{margin:0;padding:8px;background:transparent;font-family:Inter,sans-serif;}
  #diagram{display:flex;justify-content:center;align-items:flex-start;}
  #diagram svg{max-width:100%;height:auto;}
  .error{color:#c05a5a;font-size:0.85rem;padding:12px;background:#fde8e8;border-radius:8px;}
</style>
</head>
<body>
<div id="diagram"></div>
<script type="module">
  import { renderMermaidSVG } from '${beautifulMermaidEsm}';
  const dsl = \`${escapedDsl}\`;
  const container = document.getElementById('diagram');
  try {
    const svg = renderMermaidSVG(dsl, {
      bg: 'transparent',
      fg: '#1e293b',
      accent: '#3b82f6',
      line: '#64748b',
      border: '#94a3b8',
    });
    container.innerHTML = svg;
  } catch(e) {
    container.innerHTML = '<div class="error">Diagram render error: ' + e.message + '</div>';
  }
</script>
</body>
</html>`
}
