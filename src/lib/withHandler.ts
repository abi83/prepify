import { type NextRequest, NextResponse } from "next/server"

import { createLogger, parseTraceparent, serializeError } from "./logger"
import type { Logger } from "./logger"

type WrappedHandler = (req: NextRequest, logger: Logger) => Promise<NextResponse>

export function withHandler(handler: WrappedHandler): (req: NextRequest) => Promise<NextResponse> {
  return async (req) => {
    const trace = parseTraceparent(req.headers.get("traceparent")) ?? undefined
    const logger = createLogger({ trace })
    try {
      return await handler(req, logger)
    } catch (err) {
      logger.error("Unhandled route error", {
        error: serializeError(err),
        method: req.method,
        path: new URL(req.url).pathname,
      })
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }
  }
}
