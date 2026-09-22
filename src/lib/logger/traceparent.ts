import type { TraceContext } from "./types"

// W3C traceparent: 00-{32-hex traceId}-{16-hex spanId}-{2-hex flags}
export function parseTraceparent(header: string | null): TraceContext | null {
  if (!header) return null
  const parts = header.split("-")
  if (parts.length !== 4 || parts[0] !== "00") return null
  const [, traceId, spanId] = parts
  if (traceId.length !== 32 || spanId.length !== 16) return null
  return { traceId, spanId }
}
