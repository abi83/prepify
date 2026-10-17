import { assetHintSchema, type ActiveAssetHint } from "@/types/questions"

/** The question content's asset hint when it asks for an asset (needed, with a type and a description); null otherwise, including content that predates hints. */
export function activeAssetHint(content: unknown): ActiveAssetHint | null {
  const raw = (content as { asset_hint?: unknown }).asset_hint
  if (raw === undefined || raw === null) return null
  const hint = assetHintSchema.parse(raw)
  if (!hint.needed || hint.type === null || hint.description === null) return null
  return { ...hint, needed: true, type: hint.type, description: hint.description }
}
