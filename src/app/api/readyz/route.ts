import { type NextRequest, NextResponse } from "next/server"

import { logger, serializeError } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { withHandler } from "@/lib/withHandler"

export const GET = withHandler(async (_req: NextRequest) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok" })
  } catch (err) {
    logger.error("readyz: db check failed", { error: serializeError(err) })
    return NextResponse.json({ status: "unavailable", reason: "db" }, { status: 503 })
  }
})
