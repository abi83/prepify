/** A prompt's stable id and hand-bumped semver, declared next to its text. Composed prompts (base + language, rubric) version the base text; the hash covers the composition. */
export interface Prompt {
  id: string
  version: string
  text: string
}
