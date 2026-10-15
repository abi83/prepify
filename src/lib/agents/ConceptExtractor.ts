import type { AgentDeps } from "@/core/ports"
import { runAgent, type AgentResult } from "@/lib/agent"
import { MAX_PAGE_CHARS, type SupportedLanguage } from "@/lib/config"
import { conceptsResponseSchema, type PageConcepts } from "@/types/pipeline"
import type { Page } from "@/types/prep"

const SYSTEM_PROMPT = `You are a specialized concept extraction assistant for test preparation systems.

A concept is assessable if it:
1. Can be TESTED in an exam question (knowledge, application, or analysis)
2. Represents the KNOWLEDGE that students must understand
3. Appears in the provided text — NO hallucination

EXTRACTION RULES:
- Extract every concept worth testing a student on — do not aim for a specific count
- Focus on: facts, definitions, processes, mechanisms, relationships, principles
- Assign each concept an importance score (0.0–1.0) reflecting how central it is to the material
- Include 0-3 misconceptions per concept (can be empty list)
- If the text contains no assessable concepts, return an empty list and set "emptyReason":
  - "not_educational": the page is not study material (e.g. a photo of something unrelated)
  - "unreadable": the text is too garbled or too short to judge
  - "no_assessable_content": it is study material, but nothing in it is testable
  Otherwise "emptyReason" is null.

AVOID REDUNDANCY:
- Before adding a concept, check if it is already fully covered as a sub-point of a broader concept you've already listed — if so, skip it
- Prefer one broader concept over two narrow overlapping ones
- Do not extract the same idea twice under different names

DESCRIPTIONS:
- 1–2 sentences maximum
- State what the concept is and why it matters for understanding the material
- Do not restate the source text verbatim or list every detail — focus on what makes it testable

MISCONCEPTIONS:
- Each misconception must be FACTUALLY INCORRECT
- Must represent a plausible error a student could genuinely hold — not a trivial logical negation ("X does not exist" or "X never happens" are not misconceptions)
- Good misconceptions reflect confusion between related concepts, common overgeneralizations, or subtle errors in reasoning

IMPORTANCE SCORING:
- 0.8–1.0: Core concepts; without these the material cannot be understood
- 0.5–0.8: Important supporting concepts
- 0.2–0.5: Secondary details worth knowing
- 0.0–0.2: Edge cases, minor details

NOT ASSESSABLE (skip):
- Meta-information about the document itself (page numbers, headers, footnotes)
- Instructions, exam logistics, scoring rubrics
- Unrelated asides or parenthetical remarks

Return a JSON object: { "concepts": [ { "name": "...", "description": "...", "importance": 0.0–1.0, "misconceptions": ["..."] } ], "emptyReason": null }
The list will be capped at 20 entries — prioritise by importance if you have more.`

function serializePage(page: Page): string {
  const parts = [ `=== Page ${page.page} ===\n${page.text}` ]
  if (page.visual_elements.length > 0) {
    const visuals = page.visual_elements.map((el, i) => {
      const lines = [ `[Visual ${i + 1}] Type: ${el.type}`, `Description: ${el.description}` ]
      if (el.content) lines.push(`Content: ${el.content}`)
      if (el.caption) lines.push(`Caption: ${el.caption}`)
      if (el.context) lines.push(`Referenced by: ${el.context}`)
      return lines.join("\n")
    })
    parts.push(`--- Visual Elements ---\n${visuals.join("\n\n")}`)
  }
  return parts.join("\n\n")
}

/** One LLM call for one page. Concepts below importance 0.5 are dropped; if none are left, the page counts as empty. */
export async function runConceptExtractor(
  page: Page,
  model: string,
  tier: string,
  language: SupportedLanguage,
  signal: AbortSignal,
  deps: AgentDeps,
): Promise<AgentResult<PageConcepts>> {
  const serialized = serializePage(page)
  if (serialized.length > MAX_PAGE_CHARS) {
    throw new Error(`Page ${page.page} is ${serialized.length} characters, over the ${MAX_PAGE_CHARS} limit`)
  }
  const langInstruction = language !== "en" ? `\nRespond in the same language as the source text (${language}).` : ""

  const { output, meta } = await runAgent({
    name: "ConceptExtractor",
    systemPrompt: SYSTEM_PROMPT + langInstruction,
    userContent: { textContent: `Source text:\n\n${serialized}` },
    schema: conceptsResponseSchema,
    model,
    tier,
    signal,
    deps,
  })

  if (output.emptyReason !== null) return { output: { status: "empty", reason: output.emptyReason }, meta }
  const concepts = output.concepts.filter(c => c.importance >= 0.5).map(c => ({ ...c, language }))
  if (concepts.length === 0) return { output: { status: "empty", reason: "no_assessable_content" }, meta }
  return { output: { status: "found", concepts }, meta }
}
