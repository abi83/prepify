import { parseGenerationConfig, type GenerationConfig } from "@/core/lib/generationConfig"

const STORAGE_KEY = "prepify_gen_config"

export function getGenerationConfig(): GenerationConfig {
  return parseGenerationConfig(localStorage.getItem(STORAGE_KEY))
}

export function setGenerationConfig(config: GenerationConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}
