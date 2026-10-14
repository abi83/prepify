import type { Instrumentation } from "next"

export async function register() {
  // register() is also bundled for the Edge runtime, where process.exit doesn't exist — this
  // app has no edge routes, so skip validation there rather than failing the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // A thrown error here surfaces in logs but doesn't stop Next from listening — process.exit
  // forces an actual boot failure instead of a container that looks healthy but is misconfigured.
  try {
    await import("./src/lib/env")
  } catch (err) {
    console.error(err)
    process.exit(1)
  }

  if (process.env.NODE_ENV !== "production") return
  const { captureProcessOutput } = await import("./src/lib/logger/captureProcessOutput")
  const { serverLogger } = await import("./src/lib/logger/server")
  captureProcessOutput(serverLogger)
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { createLogger } = await import("./src/lib/logger/core")
  const { parseTraceparent } = await import("./src/lib/logger/traceparent")
  const { serializeError } = await import("./src/lib/logger/serialize")

  const traceparent = request.headers.traceparent
  const trace = parseTraceparent(typeof traceparent === "string" ? traceparent : null) ?? undefined
  createLogger({ trace }).error("Unhandled request error", {
    error: serializeError(err),
    method: request.method,
    path: request.path,
    ...context,
  })
}
