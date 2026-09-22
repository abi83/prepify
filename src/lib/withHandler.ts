import { type NextRequest, NextResponse } from "next/server"

import { logger, parseTraceparent, runWithTrace, serializeError } from "./logger"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (req: NextRequest, ctx: any) => Promise<NextResponse>

export function withHandler(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const trace = parseTraceparent(req.headers.get("traceparent"))
    return runWithTrace(trace, async () => {
      try {
        return await handler(req, ctx)
      } catch (err) {
        logger.error("Unhandled route error", {
          error: serializeError(err),
          method: req.method,
          path: new URL(req.url).pathname,
        })
        return NextResponse.json({ error: "Internal server error" }, { status: 500 })
      }
    })
  }
}
