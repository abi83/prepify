import { AsyncLocalStorage } from "async_hooks"
import { readFileSync } from "fs"
import path from "path"

import { formatGcp } from "./gcp"
import type { FormatArgs, LogFields, LogLevel, TraceContext } from "./types"

const traceStore = new AsyncLocalStorage<TraceContext>()

const APP_VERSION = (() => {
  try {
    return readFileSync(path.join(process.cwd(), "version.txt"), "utf-8").trim()
  } catch {
    return "unknown"
  }
})()

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function minLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase()
  if (raw && raw in LEVEL_ORDER) return raw as LogLevel
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

function formatPlain(args: FormatArgs): Record<string, unknown> {
  const { level, message, version, trace, fields } = args
  return { level, message, version, ...trace, ...fields }
}

const format = process.env.NODE_ENV === "production" ? formatGcp : formatPlain

export function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return
  const trace = traceStore.getStore() ?? null
  const entry = format({ level, message, version: APP_VERSION, trace, fields })
  process.stdout.write(JSON.stringify(entry) + "\n")
}

export function runWithTrace<T>(ctx: TraceContext | null, fn: () => Promise<T>): Promise<T> {
  if (!ctx) return fn()
  return traceStore.run(ctx, fn)
}
