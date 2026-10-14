import { afterEach, describe, expect, it, vi } from "vitest"

import type { Logger } from "@/core/logger"
import { captureProcessOutput } from "@/lib/logger/captureProcessOutput"

const original = { ...console }
const originalWarningListeners = process.listeners("warning")

afterEach(() => {
  Object.assign(console, original)
  process.removeAllListeners("warning")
  originalWarningListeners.forEach(listener => process.on("warning", listener))
})

function recordingLogger(): Logger & { calls: [ string, string ][] } {
  const calls: [ string, string ][] = []
  const record = (level: string) => (message: string) => { calls.push([ level, message ]) }
  return { calls, debug: record("debug"), info: record("info"), warn: record("warn"), error: record("error") }
}

describe("captureProcessOutput", () => {
  it("routes console methods to logger levels as one formatted message", () => {
    const logger = recordingLogger()
    captureProcessOutput(logger)

    console.log("a %s", "b")
    console.warn("multi\nline")
    console.error(new Error("boom").message, 42)

    expect(logger.calls).toEqual([ [ "info", "a b" ], [ "warn", "multi\nline" ], [ "error", "boom 42" ] ])
  })

  it("logs process warnings as a single warn entry", () => {
    const logger = recordingLogger()
    const warn = vi.spyOn(logger, "warn")
    captureProcessOutput(logger)

    process.emit("warning", new Error("deprecated"))

    expect(warn).toHaveBeenCalledWith("deprecated", expect.objectContaining({ error: expect.objectContaining({ message: "deprecated" }) }))
  })
})
