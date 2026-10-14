import { format } from "util"

import type { Logger } from "@/core/logger"

import { serializeError } from "./serialize"

const CONSOLE_LEVELS = { log: "info", info: "info", debug: "debug", warn: "warn", error: "error" } as const

/** Makes third-party `console.*` calls and Node warnings structured entries (one per call, with severity) instead of per-line stderr text. */
export function captureProcessOutput(logger: Logger): void {
  for (const [ method, level ] of Object.entries(CONSOLE_LEVELS)) {
    console[method as keyof typeof CONSOLE_LEVELS] = (...args: unknown[]) => logger[level](format(...args))
  }
  // Drops Node's default stderr printer so warnings aren't logged twice.
  process.removeAllListeners("warning")
  process.on("warning", warning => logger.warn(warning.message, { error: serializeError(warning) }))
}
