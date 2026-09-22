import type { TraceContext } from "./types"

// W3C traceparent: 00-{32-hex traceId}-{16-hex spanId}-{2-hex flags}
export function parseTraceparent(header: string | null): TraceContext | null {
  if (!header) return null
  const parts = header.split("-")
  if (parts.length !== 4 || parts[0] !== "00") return null
  const [ , traceId, spanId, flags ] = parts
  if (!/^[0-9a-f]{32}$/.test(traceId) || !/^[0-9a-f]{16}$/.test(spanId)) return null
  const sampled = (parseInt(flags, 16) & 1) === 1
  return { traceId, spanId, sampled }
}
