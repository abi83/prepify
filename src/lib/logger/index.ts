import { emit } from "./core"
import type { LogFields } from "./types"

export { runWithTrace } from "./core"
export { parseTraceparent } from "./traceparent"

export const logger = {
  debug: (message: string, fields?: LogFields) => emit("debug", message, fields),
  info:  (message: string, fields?: LogFields) => emit("info",  message, fields),
  warn:  (message: string, fields?: LogFields) => emit("warn",  message, fields),
  error: (message: string, fields?: LogFields) => emit("error", message, fields),
}

// Serialize an unknown thrown value into structured fields for error logging.
export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { raw: String(err) }
  const base: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  }
  for (const key of Object.getOwnPropertyNames(err)) {
    if (!(key in base)) base[key] = (err as unknown as Record<string, unknown>)[key]
  }
  return base
}
