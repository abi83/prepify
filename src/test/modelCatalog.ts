import { parseModelCatalog } from "@/lib/modelCatalog"

/** Small fixed catalog for tests; the fake models stand in for whatever a test's fake LLM reports. */
export const testCatalog = parseModelCatalog({
  openai: {
    tiers: {
      flex: { label: "Flex", multiplier: 0.5 },
      default: { label: "Standard", multiplier: 1 },
      priority: { label: "Priority", multiplier: 2 },
    },
    models: {
      "gpt-5-nano": { label: "GPT-5 Nano", input: 0.05, cachedInput: 0.005, output: 0.40 },
      "gpt-5-mini": { label: "GPT-5 Mini", input: 0.25, cachedInput: 0.025, output: 2.00 },
      "m": { label: "m", input: 0.05, cachedInput: 0.005, output: 0.40 },
      "other": { label: "other", input: 0.05, cachedInput: 0.005, output: 0.40 },
      "big-judge": { label: "big-judge", input: 0.05, cachedInput: 0.005, output: 0.40 },
    },
  },
  gemini: {
    tiers: {
      flex: { label: "Flex", multiplier: 0.5 },
      default: { label: "Standard", multiplier: 1 },
    },
    models: {
      "gemini-3.1-flash-lite": { label: "Gemini 3.1 Flash-Lite", input: 0.25, cachedInput: 0.025, output: 1.50 },
    },
  },
  local: {
    models: {
      "local-model": { label: "local-model", input: 0, cachedInput: 0, output: 0 },
      "google/gemma-4-26b-a4b": { label: "Gemma", input: 0, cachedInput: 0, output: 0 },
    },
  },
})
