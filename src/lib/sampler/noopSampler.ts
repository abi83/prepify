import type { Sampler } from "@/core/sampler"

export const noopSampler: Sampler = {
  record: async () => {},
}
