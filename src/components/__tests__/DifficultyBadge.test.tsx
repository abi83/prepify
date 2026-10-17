import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import DifficultyBadge, { countByDifficulty } from "@/components/DifficultyBadge"

describe("DifficultyBadge", () => {
  it("renders the tier label", () => {
    render(<DifficultyBadge difficulty="hard" />)
    expect(screen.getByText("hard")).toBeTruthy()
  })

  it("renders nothing for legacy rows", () => {
    const { container } = render(<DifficultyBadge difficulty={null} />)
    expect(container.innerHTML).toBe("")
  })

  it("throws on an unknown tier", () => {
    expect(() => render(<DifficultyBadge difficulty="extreme" />)).toThrow()
  })
})

describe("countByDifficulty", () => {
  it("counts per tier and skips nulls", () => {
    const counts = countByDifficulty([ { difficulty: "easy" }, { difficulty: "hard" }, { difficulty: "hard" }, { difficulty: null } ])
    expect(counts).toEqual({ easy: 1, medium: 0, hard: 2 })
  })
})
