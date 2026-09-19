import { prisma } from "../lib/prisma"
import type { GenerationMetaRecord } from "../types/generationMeta"

/** Called internally after LLM generation — not a user-facing mutation, so no ownership check. */
export async function record(entry: GenerationMetaRecord): Promise<void> {
  await prisma.generationMeta.create({ data: entry })
}
