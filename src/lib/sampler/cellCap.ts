import type { AgentSample } from "@/core/sampler"

import { cellPrefix } from "./storedSample"

export function cellOf(sample: AgentSample): string {
  return cellPrefix({ agent: sample.agent, promptHash: sample.promptHash, model: sample.meta.model })
}

/**
 * Skips the write once the sample's cell holds `max` samples. `countCell` may stop counting at
 * `max`. Concurrent writers can overshoot slightly.
 */
export function capPerCell(
  write: (sample: AgentSample) => Promise<void>,
  countCell: (prefix: string, limit: number) => Promise<number>,
  getMax: () => number,
): (sample: AgentSample) => Promise<void> {
  return async (sample) => {
    const max = getMax()
    if ((await countCell(cellOf(sample), max)) >= max) return
    await write(sample)
  }
}
