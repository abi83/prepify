import { readFile } from "fs/promises"

import { parse } from "yaml"
import { z } from "zod"

/** Where samples or results live: a local directory or a GCS bucket (ADC auth). */
const locationSchema = z.union([
  z.strictObject({ dir: z.string().min(1) }),
  z.strictObject({ bucket: z.string().min(1) }),
])

export type Location = z.infer<typeof locationSchema>

/** Strict so a typo fails instead of silently doing nothing. */
const experimentSchema = z.strictObject({
  cell: z.strictObject({
    agent: z.string().min(1),
    promptHash: z.string().regex(/^[0-9a-f]{64}$/),
    model: z.string().min(1),
  }),
  /** Holds `samples/`. */
  samples: locationSchema,
  judge: z.strictObject({
    llm: z.strictObject({ baseUrl: z.url().optional(), model: z.string().min(1), tier: z.string().min(1) }),
    timeoutMs: z.number().int().positive(),
    /** Max judge calls in flight. */
    concurrency: z.number().int().positive(),
  }),
  /** Receives `results/`. */
  results: locationSchema,
  /** Private bucket that receives a copy of the run's samples and results under `runs/{runId}/`; omitted means no upload. */
  artifactsBucket: z.string().min(1).optional(),
})

export type Experiment = z.infer<typeof experimentSchema>

export async function loadExperiment(file: string): Promise<Experiment> {
  return experimentSchema.parse(parse(await readFile(file, "utf-8")))
}
