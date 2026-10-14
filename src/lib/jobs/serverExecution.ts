import type { PrepData } from "@/core/ports"
import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { consoleLogger } from "@/lib/logger"
import { createGcsSampler } from "@/lib/sampler/gcsSampleStore"
import * as jobRepository from "@/repositories/jobRepository"

import type { RunnerPorts } from "./generation"
import { trackServerRun } from "./runTracker"

/** Server composition root: Prisma-backed persistence (no server actions) and GCS sampling. */
export function serverPorts(apiKey: string, data: PrepData): RunnerPorts {
  return {
    store: jobRepository.createPrismaStore(),
    llm: new OpenAiLlm({ apiKey }),
    logger: consoleLogger,
    sampler: createGcsSampler(),
    data,
    listUnfinishedJobs: jobRepository.listUnfinishedJobs,
    trackRun: trackServerRun,
  }
}
