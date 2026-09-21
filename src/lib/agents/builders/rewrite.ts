import type { GeneratedQuestion } from "../../../types/questions"

/** A rejected question plus the reviewer's critique, handed to a builder to rewrite it. */
export interface RewriteInput {
  question: GeneratedQuestion
  feedback: string
}

/** User-prompt suffix for a rewrite call; empty for a first build. */
export function rewriteInstructions(rewrite: RewriteInput | undefined): string {
  if (!rewrite) return ""
  return "\n\nA previous attempt at this question was rejected by a reviewer. " +
    "Write an improved replacement that addresses the critique; do not merely restate the old question.\n\n" +
    `Rejected question:\n${JSON.stringify(rewrite.question, null, 2)}\n\nReviewer critique:\n${rewrite.feedback}`
}
