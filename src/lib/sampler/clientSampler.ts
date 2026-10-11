import { getSampleRate, recordSample } from "@/actions/samples"

import { createRateSampler } from "./rateSampler"
import type { Sampler } from "./schema"

let rate: Promise<number> | undefined

/**
 * Browser-side sampler for the client pipeline: rolls the server's `SAMPLE_RATE` locally, so
 * payloads (base64 images) are only sent to `recordSample` for kept runs.
 */
export const clientSampler: Sampler = createRateSampler(() => (rate ??= getSampleRate()), recordSample)
