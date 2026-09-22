import type { QuestionTask } from "@/types/pipeline"

/** Builder types that produce wrong options (distractors) alongside the correct answer. */
export type DistractorSupport = "with-distractors" | "no-distractors"

/** Tier-specific instructions appended to a builder's user prompt. */
export function difficultyInstructions(task: QuestionTask, distractors: DistractorSupport): string {
  const multiConcept = task.concepts.length > 1
  const lines: string[] = [ `Complexity: ${task.difficulty}` ]

  if (task.difficulty === "easy") {
    lines.push(
      " - Scenario: minimal; a definition or straightforward use of the concept.",
      " - Reasoning: single step; no trade-offs.",
    )
    if (distractors === "with-distractors") {
      lines.push(" - Distractors: clearly wrong; each reflects one obvious misdefinition.")
    }
  }

  if (task.difficulty === "medium") {
    lines.push(
      " - Scenario: a practical situation with at least ONE constraint (e.g. quality, cost, compatibility).",
      " - Reasoning: two linear steps, e.g. interpret the situation, then apply the concept.",
    )
    if (distractors === "with-distractors") {
      lines.push(" - Distractors: plausible; each fails the constraint or misapplies the concept.")
    }
  }

  if (task.difficulty === "hard") {
    lines.push(
      multiConcept
        ? " - Scenario: integrates the concepts so they interact, with an explicit trade-off between them."
        : " - Scenario: applies the concept where a common misconception seems to fit.",
      " - Reasoning: multi-step synthesis (interpret, apply, weigh trade-offs, decide).",
      distractors === "with-distractors"
        ? " - Distractors: near-misses built from the listed misconceptions, each failing a subtle condition."
        : " - Pitfalls: build in a trap based on the listed misconceptions.",
    )
  }

  return lines.join("\n")
}
