import { requireModel } from "@/lib/modelCatalog"
import type { ModelCatalog } from "@/types/modelCatalog"

/** Providers a user can bring their own key for; the catalog may list others (e.g. local servers). */
export const PROVIDERS = [ "openai", "gemini" ] as const
export type Provider = (typeof PROVIDERS)[number]

export function isProvider(value: unknown): value is Provider {
  return PROVIDERS.includes(value as Provider)
}

interface ProviderInfo {
  label: string
  keyUrl: string
  keyPlaceholder: string
  defaultModel: string
  defaultTier: string
}

export const PROVIDER_INFO: Record<Provider, ProviderInfo> = {
  openai: { label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", keyPlaceholder: "sk-...", defaultModel: "gpt-5-nano", defaultTier: "flex" },
  gemini: { label: "Gemini", keyUrl: "https://aistudio.google.com/apikey", keyPlaceholder: "AIza...", defaultModel: "gemini-3.1-flash-lite", defaultTier: "flex" },
}

/** The BYOK provider that serves the model; throws for an unlisted model or a provider without BYOK support. */
export function providerOf(catalog: ModelCatalog, model: string): Provider {
  const { provider } = requireModel(catalog, model)
  if (!isProvider(provider)) throw new Error(`Model "${model}" belongs to "${provider}", which does not take an API key`)
  return provider
}
