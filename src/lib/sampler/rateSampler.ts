import type { AgentSample, Sampler } from "@/core/sampler"

/** Keeps a `rate` (0–1) fraction of executions and hands them to `write`. */
export function createRateSampler(
  getRate: () => number | Promise<number>,
  write: (sample: AgentSample) => Promise<void>,
  random: () => number = Math.random,
): Sampler {
  return {
    async record(sample) {
      if (random() >= (await getRate())) return
      await write(sample)
    },
  }
}
