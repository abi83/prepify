export type LogLevel = "debug" | "info" | "warn" | "error"

export type TraceContext = {
  traceId: string
  spanId: string
  sampled: boolean
}

export type LogFields = Record<string, unknown>

export type FormatArgs = {
  level: LogLevel
  message: string
  version: string
  trace: TraceContext | null
  fields: LogFields | undefined
}

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}
