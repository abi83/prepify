import { prisma } from "@/lib/prisma"
import type { GenerationMetaRecord } from "@/types/generationMeta"

/** Called internally after LLM generation — not a user-facing mutation, so no ownership check. */
export async function record(entry: GenerationMetaRecord): Promise<void> {
  await prisma.generationMeta.create({ data: entry })
}

/** Batched variant of `record` — one round-trip for several rows (e.g. a slot's wasted attempts). */
export async function recordMany(entries: GenerationMetaRecord[]): Promise<void> {
  if (entries.length === 0) return
  await prisma.generationMeta.createMany({ data: entries })
}
