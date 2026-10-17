import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import GenerationCost, { formatUsage, GenerationCostLine, generatedAtOf } from "@/components/GenerationCost"
import { formatDate } from "@/lib/format"
import type { JobGeneration } from "@/repositories/prepStateRepository"

const FIRST = new Date("2026-03-04T12:00:00Z")
const LAST = new Date("2026-03-06T12:00:00Z")

const generation: JobGeneration = {
  jobId: "j1", type: "question", status: "executed", failureReason: null, subject: "single_choice · easy", model: "gpt-5-nano", tier: "flex",
  calls: [
    { promptTokens: 1000, cachedTokens: 0, completionTokens: 300, costUsd: 0.002, executionMs: 1, wasted: false, generatedAt: FIRST },
    { promptTokens: 400, cachedTokens: 0, completionTokens: 100, costUsd: 0.0005, executionMs: 1, wasted: true, generatedAt: LAST },
  ],
}

describe("GenerationCost", () => {
  it("collapses to model · cost, wasted calls included, and expands to tokens, tier and date", () => {
    render(<GenerationCost generation={generation} />)
    expect(screen.getByText("gpt-5-nano · $0.0025")).toBeInTheDocument()
    expect(screen.getByText(`1,400 in / 400 out · flex · ${formatDate(LAST)}`)).toBeInTheDocument()
  })

  it("prefixes the summary with a label", () => {
    render(<GenerationCost generation={generation} label="Wasted" />)
    expect(screen.getByText("Wasted: gpt-5-nano · $0.0025")).toBeInTheDocument()
  })

  it("shows costs below the threshold as < $0.001", () => {
    render(<GenerationCost generation={{ ...generation, calls: [ { ...generation.calls[0], costUsd: 0.0001 } ] }} />)
    expect(screen.getByText("gpt-5-nano · < $0.001")).toBeInTheDocument()
  })

  it("renders the plain variant without details", () => {
    const { container } = render(<GenerationCostLine generation={generation} />)
    expect(container).toHaveTextContent("gpt-5-nano · $0.0025")
    expect(container.querySelector("details")).toBeNull()
  })
})

describe("helpers", () => {
  it("formats tokens and cost together", () => {
    expect(formatUsage(1300, 0.002)).toBe("1,300 tokens · $0.0020")
  })

  it("dates a job by its latest call", () => {
    expect(generatedAtOf(generation)).toEqual(LAST)
  })
})
