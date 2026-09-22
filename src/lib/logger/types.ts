export type LogLevel = "debug" | "info" | "warn" | "error"

export type TraceContext = {
  traceId: string
  spanId: string
}

export type LogFields = Record<string, unknown>

export type FormatArgs = {
  level: LogLevel
  message: string
  version: string
  trace: TraceContext | null
  fields: LogFields | undefined
}
