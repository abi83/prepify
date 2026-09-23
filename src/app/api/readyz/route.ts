import { Storage } from "@google-cloud/storage"
import { type NextRequest, NextResponse } from "next/server"

import { config } from "@/lib/env"
import { serializeError } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { withHandler } from "@/lib/withHandler"

export const GET = withHandler(async (_req: NextRequest, logger) => {
  const [dbResult, gcsResult] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    new Storage().bucket(config.GCS_BUCKET_NAME).exists().then(([ok]) => {
      if (!ok) throw new Error(`bucket ${config.GCS_BUCKET_NAME} not found`)
    }),
  ])

  if (dbResult.status === "rejected") {
    logger.error("readyz: db check failed", { error: serializeError(dbResult.reason) })
    return NextResponse.json({ status: "unavailable", reason: "db" }, { status: 503 })
  }

  if (gcsResult.status === "rejected") {
    logger.error("readyz: gcs check failed", { error: serializeError(gcsResult.reason) })
    return NextResponse.json({ status: "unavailable", reason: "gcs" }, { status: 503 })
  }

  return NextResponse.json({ status: "ok" })
})
