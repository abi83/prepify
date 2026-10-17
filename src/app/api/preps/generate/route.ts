import { after, NextResponse } from "next/server"

import { MAX_IMAGES } from "@/core/lib/config"
import { auth } from "@/lib/auth"
import { acquirePrepRun, releasePrepRun, RunInProgressError, runServerGeneration, serverRunRequestSchema } from "@/lib/jobs/serverRun"
import { assertModelAndTier } from "@/lib/modelCatalog"
import { loadModelCatalog } from "@/lib/modelCatalogFile"
import { withHandler } from "@/lib/withHandler"
import { ForbiddenError, NotFoundError } from "@/repositories/errors"
import * as prepImageRepository from "@/repositories/prepImageRepository"
import * as prepRepository from "@/repositories/prepRepository"

// Cloud Run request timeout must match; `after()` work is cut off at this duration.
export const maxDuration = 3600

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status })

export const POST = withHandler(async req => {
  const session = await auth()
  const userId = session?.user.id
  if (!userId) return error("Not authenticated", 401)

  const body = serverRunRequestSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) return error("Invalid request", 400)
  const { prepId, model, tier } = body.data
  try {
    assertModelAndTier(await loadModelCatalog(), "openai", model, tier)
  } catch (e) {
    return error(e instanceof Error ? e.message : "Invalid model or tier", 400)
  }

  try {
    const prep = await prepRepository.getPrep(userId, prepId)
    if (prep.userId !== userId) throw new ForbiddenError(`Prep ${prepId} is not owned by ${userId}`)
    const pageCount = (await prepImageRepository.listImages(userId, prepId)).length
    if (pageCount > MAX_IMAGES) return error(`A prep has at most ${MAX_IMAGES} pages, got ${pageCount}`, 400)
    await acquirePrepRun(prepId)
  } catch (e) {
    if (e instanceof NotFoundError) return error("Prep not found", 404)
    if (e instanceof ForbiddenError) return error("Forbidden", 403)
    if (e instanceof RunInProgressError) return error("A run is already in progress for this prep", 409)
    throw e
  }

  try {
    after(() => runServerGeneration(userId, body.data))
  } catch (e) {
    releasePrepRun(prepId)
    throw e
  }
  return NextResponse.json({ status: "triggered" }, { status: 202 })
})
