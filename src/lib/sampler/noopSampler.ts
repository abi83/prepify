import type { Sampler } from "./schema"

export const noopSampler: Sampler = {
  record: async () => {},
}
