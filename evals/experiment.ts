import { readFile } from "fs/promises"

import { parse } from "yaml"
import { z } from "zod"

/** Strict so a typo fails instead of silently doing nothing. */
const experimentSchema = z.strictObject({
  cell: z.strictObject({
    agent: z.string().min(1),
    promptHash: z.string().regex(/^[0-9a-f]{64}$/),
    model: z.string().min(1),
  }),
  /** Directory containing `samples/`. */
  samplesDir: z.string().min(1),
  judge: z.strictObject({
    llm: z.strictObject({ baseUrl: z.url().optional(), model: z.string().min(1), tier: z.string().min(1) }),
    timeoutMs: z.number().int().positive(),
  }),
  /** Directory results are written under, in `results/`. */
  outputDir: z.string().min(1),
})

export type Experiment = z.infer<typeof experimentSchema>

export async function loadExperiment(file: string): Promise<Experiment> {
  return experimentSchema.parse(parse(await readFile(file, "utf-8")))
}
