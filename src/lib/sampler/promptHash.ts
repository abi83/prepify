/** sha-256 hex of the system prompt — the prompt's identity; there are no hand-bumped version constants. */
export async function hashPrompt(systemPrompt: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(systemPrompt))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("")
}
