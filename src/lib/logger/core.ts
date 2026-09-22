import { readFileSync } from "fs"
import path from "path"

import { formatGcp } from "./gcp"
import type { FormatArgs, LogFields, LogLevel, Logger, TraceContext } from "./types"

const APP_VERSION = (() => {
  try {
    return readFileSync(path.join(process.cwd(), "version.txt"), "utf-8").trim()
  } catch {
    return "unknown"
  }
})()

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function defaultMinLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase()
  if (raw && raw in LEVEL_ORDER) return raw as LogLevel
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

function formatPlain(args: FormatArgs): Record<string, unknown> {
  const { level, message, version, trace, fields } = args
  return { ...fields, ...trace, level, message, version }
}

export type LoggerOptions = {
  trace?: TraceContext
  transport?: (line: string) => void
  minLevel?: LogLevel
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const trace = opts.trace ?? null
  const transport = opts.transport ?? ((line) => process.stdout.write(line + "\n"))
  const minLevel = opts.minLevel ?? defaultMinLevel()
  const format = process.env.NODE_ENV === "production" ? formatGcp : formatPlain

  function emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return
    const entry = format({ level, message, version: APP_VERSION, trace, fields })
    transport(JSON.stringify(entry))
  }

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info:  (message, fields) => emit("info", message, fields),
    warn:  (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  }
}
