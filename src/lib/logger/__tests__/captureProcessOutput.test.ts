import { afterEach, describe, expect, it, vi } from "vitest"

import type { Logger } from "@/core/logger"
import { captureProcessOutput } from "@/lib/logger/captureProcessOutput"

const original = { ...console }
const EVENTS = [ "warning", "unhandledRejection", "uncaughtException" ] as const
const originalListeners = Object.fromEntries(EVENTS.map(event => [ event, process.listeners(event) ])) as Record<string, ((...args: any[]) => void)[]>

afterEach(() => {
  Object.assign(console, original)
  for (const event of EVENTS) {
    process.removeAllListeners(event)
    originalListeners[event].forEach(listener => process.on(event, listener))
  }
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

  it("logs unhandled rejections and exits non-zero on uncaught exceptions", () => {
    const logger = recordingLogger()
    const error = vi.spyOn(logger, "error")
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never)
    captureProcessOutput(logger)

    process.emit("unhandledRejection", new Error("rejected"), Promise.resolve())
    expect(error).toHaveBeenLastCalledWith("Unhandled rejection", expect.objectContaining({ error: expect.objectContaining({ message: "rejected" }) }))
    expect(exit).not.toHaveBeenCalled()

    process.emit("uncaughtException", new Error("thrown"))
    expect(error).toHaveBeenLastCalledWith("Uncaught exception", expect.objectContaining({ error: expect.objectContaining({ message: "thrown" }) }))
    expect(exit).toHaveBeenCalledWith(1)
    exit.mockRestore()
  })
})
