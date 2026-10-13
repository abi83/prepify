import { readFile } from "fs/promises"

import { parse } from "yaml"
import { z } from "zod"

import type { LogLevel } from "@/core/logger"
import { ALL_QUESTION_TYPES, DEFAULT_GEN_CONFIG, type GenerationConfig } from "@/lib/generationConfig"
import { DEFAULT_CONCURRENCY, DEFAULT_JOB_SETTINGS } from "@/lib/jobs/generation"

export interface CliConfig {
  llm: { baseUrl: string | undefined; model: string; tier: string; temperature: number | undefined; maxTokens: number | undefined }
  job: { timeoutMs: number; maxRetries: number }
  run: { concurrency: number; maxChars: number }
  log: { level: LogLevel }
  target: GenerationConfig
}

export const DEFAULT_CLI_CONFIG: CliConfig = {
  llm: { baseUrl: undefined, model: "gpt-5-mini", tier: "default", temperature: undefined, maxTokens: undefined },
  job: DEFAULT_JOB_SETTINGS,
  run: { concurrency: DEFAULT_CONCURRENCY, maxChars: 60_000 },
  log: { level: "debug" },
  target: DEFAULT_GEN_CONFIG,
}

const LOG_LEVELS = [ "debug", "info", "warn", "error" ] as const satisfies readonly LogLevel[]
const positiveInt = z.number().int().positive()

/** Strict so a typo like `timeout` fails instead of silently doing nothing. */
const overridesSchema = z.strictObject({
  llm: z.strictObject({
    baseUrl: z.url(),
    model: z.string().min(1),
    tier: z.string().min(1),
    temperature: z.number().min(0).max(2),
    maxTokens: positiveInt,
  }).partial(),
  job: z.strictObject({ timeoutMs: positiveInt, maxRetries: z.number().int().nonnegative() }).partial(),
  run: z.strictObject({ concurrency: positiveInt, maxChars: positiveInt }).partial(),
  log: z.strictObject({ level: z.enum(LOG_LEVELS) }).partial(),
  target: z.strictObject({
    questionCount: positiveInt,
    enabledTypes: z.array(z.enum(ALL_QUESTION_TYPES)).min(1),
    difficultyMix: z.strictObject({ easy: z.number().nonnegative(), medium: z.number().nonnegative(), hard: z.number().nonnegative() }),
  }).partial(),
}).partial()

export type CliConfigOverrides = z.input<typeof overridesSchema>

/** Defaults with `overrides` applied per section; throws on unknown keys or invalid values. */
export function resolveCliConfig(overrides: CliConfigOverrides): CliConfig {
  const parsed = overridesSchema.parse(overrides)
  return {
    llm: { ...DEFAULT_CLI_CONFIG.llm, ...parsed.llm },
    job: { ...DEFAULT_CLI_CONFIG.job, ...parsed.job },
    run: { ...DEFAULT_CLI_CONFIG.run, ...parsed.run },
    log: { ...DEFAULT_CLI_CONFIG.log, ...parsed.log },
    target: { ...DEFAULT_CLI_CONFIG.target, ...parsed.target },
  }
}

export async function loadCliConfig(file: string): Promise<CliConfig> {
  const content = parse(await readFile(file, "utf-8")) as unknown
  if (content === null) return resolveCliConfig({})
  return resolveCliConfig(content as CliConfigOverrides)
}
