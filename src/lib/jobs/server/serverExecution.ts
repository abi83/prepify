import type { PrepData } from "@/core/ports"
import type { RunnerPorts } from "@/lib/jobs/generation"
import { createLlm } from "@/lib/llm/createLlm"
import { providerOf } from "@/lib/llm/provider"
import { serverLogger } from "@/lib/logger/server"
import { loadModelCatalog } from "@/lib/modelCatalogFile"
import { createGcsSampler } from "@/lib/sampler/gcsSampleStore"
import * as jobRepository from "@/repositories/jobRepository"

import { trackServerRun } from "./runTracker"

/** Server composition root: Prisma-backed persistence (no server actions) and GCS sampling. */
export async function serverPorts(apiKey: string, model: string, data: PrepData): Promise<RunnerPorts> {
  const catalog = await loadModelCatalog()
  return {
    store: jobRepository.createPrismaStore(),
    llm: createLlm(providerOf(catalog, model), apiKey),
    logger: serverLogger,
    sampler: createGcsSampler(),
    catalog,
    data,
    listUnfinishedJobs: jobRepository.listUnfinishedJobs,
    trackRun: trackServerRun,
  }
}
