import type { FormatArgs } from "./types"

const GCP_SEVERITY = { debug: "DEBUG", info: "INFO", warn: "WARNING", error: "ERROR" } as const

export function formatGcp(args: FormatArgs): Record<string, unknown> {
  const { level, message, version, trace, fields } = args
  const project = process.env.GOOGLE_CLOUD_PROJECT

  const entry: Record<string, unknown> = {
    severity: GCP_SEVERITY[level],
    message,
    version,
    ...fields,
  }

  if (trace) {
    entry["logging.googleapis.com/spanId"] = trace.spanId
    entry["logging.googleapis.com/trace"] = project
      ? `projects/${project}/traces/${trace.traceId}`
      : trace.traceId
  }

  return entry
}
