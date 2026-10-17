export const prepPagesPrefix = (prepId: string) => `prep-pages/${prepId}/`

export function assertPrepPageKey(prepId: string, gcsKey: string): void {
  const name = gcsKey.slice(prepPagesPrefix(prepId).length)
  if (!gcsKey.startsWith(prepPagesPrefix(prepId)) || !name || name.includes("/") || name.includes("..")) {
    throw new Error(`GCS key "${gcsKey}" is not a page key of prep ${prepId}`)
  }
}
