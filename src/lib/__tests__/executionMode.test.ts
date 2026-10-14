import { beforeEach, describe, expect, it } from "vitest"

import { getExecutionMode, setExecutionMode } from "@/lib/executionMode"

beforeEach(() => localStorage.clear())

describe("execution mode preference", () => {
  it("defaults to client", () => {
    expect(getExecutionMode()).toBe("client")
  })

  it("round-trips the saved mode", () => {
    setExecutionMode("server")
    expect(getExecutionMode()).toBe("server")
  })

  it("falls back to client for an unknown stored value", () => {
    localStorage.setItem("prepify_execution_mode", "cloud")
    expect(getExecutionMode()).toBe("client")
  })
})
