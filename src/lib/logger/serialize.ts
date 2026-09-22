export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { raw: String(err) }
  const base: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    stack: err.stack,
  }
  for (const key of Object.getOwnPropertyNames(err)) {
    if (!(key in base)) base[key] = (err as unknown as Record<string, unknown>)[key]
  }
  return base
}
