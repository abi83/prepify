import { z } from 'zod'
import { runAgent, AgentResult } from '../../agent'

const responseSchema = z.object({
  molecules: z.array(z.object({
    name: z.string(),
    smiles: z.string(),
  })).min(1).max(6),
})

const SYSTEM_PROMPT = `You are a chemistry expert generating SMILES strings for structural molecule diagrams.
Given a description of a molecule or set of molecules, output their SMILES representations.

Rules:
- SMILES strings must be valid and standard (as used in PubChem / ChemDraw).
- For simple organic molecules: standard SMILES (CCO for ethanol, c1ccccc1 for benzene).
- Include a human-readable name for each molecule.
- If the description asks for multiple molecules (e.g. as answer options), include all of them (max 6).
- Keep molecules school-appropriate (organic chemistry, biochemistry, common compounds).

Return JSON: { "molecules": [{ "name": "...", "smiles": "..." }] }`

const smilesDrawerJs = 'https://unpkg.com/smiles-drawer@1.1.23/dist/smiles-drawer.min.js'

export async function runMoleculeAgent(
  description: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
): Promise<AgentResult<string>> {
  const result = await runAgent({
    name: 'MoleculeAgent',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `Generate SMILES for: ${description}`,
    schema: responseSchema,
    apiKey,
    model,
    signal,
  })

  const blob = buildMoleculeBlob(result.output.molecules)
  return { output: blob, metrics: result.metrics }
}

function buildMoleculeBlob(molecules: { name: string; smiles: string }[]): string {
  const moleculesJson = JSON.stringify(molecules)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  html,body{margin:0;padding:8px;background:transparent;font-family:Inter,sans-serif;}
  .grid{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;}
  .card{text-align:center;}
  .name{font-size:0.78rem;color:#555;margin-top:4px;}
</style>
</head>
<body>
<div class="grid" id="grid"></div>
<script src="${smilesDrawerJs}"></script>
<script>
  const molecules = ${moleculesJson};
  const grid = document.getElementById('grid');
  molecules.forEach((mol, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    const canvas = document.createElement('canvas');
    canvas.id = 'mol-' + i;
    canvas.width = 180;
    canvas.height = 140;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = mol.name;
    card.appendChild(canvas);
    card.appendChild(name);
    grid.appendChild(card);
    const drawer = new SmilesDrawer.Drawer({ width: 180, height: 140 });
    SmilesDrawer.parse(mol.smiles, tree => {
      drawer.draw(tree, 'mol-' + i, 'light', false);
    }, err => {
      canvas.style.display = 'none';
      name.textContent = mol.name + ' (render error)';
    });
  });
</script>
</body>
</html>`
}
