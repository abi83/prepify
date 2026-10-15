/** A prompt's hand-bumped semver, declared next to its text. Composed prompts (base + language, rubric) version the base text; the hash covers the composition. */
export interface Prompt {
  version: string
  text: string
}
