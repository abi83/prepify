import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'

const responseSchema = z.object({
  latex: z.string(),
  is_chemical: z.boolean(),
})

const SYSTEM_PROMPT = `You are a LaTeX math expert generating formulas for school-level study questions.
Given a description of a formula or equation, output the LaTeX source.

Rules:
- Output ONLY the LaTeX content, no surrounding $...$ delimiters (those are added by the renderer).
- For math/physics: standard LaTeX (KaTeX-compatible). Example: \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
- For chemical equations: use mhchem notation inside \\ce{...}. Example: \\ce{2H2 + O2 -> 2H2O}
- Set is_chemical=true only for chemical equations (uses \\ce{...}).
- Keep the formula concise and school-appropriate.
- If the description asks for multiple formulas (e.g. answer options), output them separated by \\quad or on separate lines using \\\\.

Return JSON: { "latex": "...", "is_chemical": false }`

export async function runFormulaAgent(
  description: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<string>> {
  const result = await runAgent({
    name: 'FormulaAgent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Generate LaTeX for: ${description}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })

  const { latex, is_chemical } = result.output
  const blob = buildFormulaBlob(latex, is_chemical)
  return { output: blob, metrics: result.metrics }
}

function buildFormulaBlob(latex: string, isChemical: boolean): string {
  const escaped = latex.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
  const katexCss = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'
  const katexJs = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js'
  const mhchemJs = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/mhchem.min.js'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="${katexCss}">
<style>
  html,body{margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;min-height:100vh;}
  .wrap{padding:12px 20px;font-size:1.35em;line-height:1.6;}
</style>
</head>
<body>
<div class="wrap" id="formula"></div>
<script src="${katexJs}"></script>${isChemical ? `\n<script src="${mhchemJs}"></script>` : ''}
<script>
  try {
    katex.render(\`${escaped}\`, document.getElementById('formula'), {
      displayMode: true,
      throwOnError: false,
    });
  } catch(e) {
    document.getElementById('formula').textContent = e.message;
  }
</script>
</body>
</html>`
}
