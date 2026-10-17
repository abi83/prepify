import { auth } from "./auth"

/** The signed-in user's id, or null for an anonymous visitor. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user.id ?? null
}

export async function requireUserId(): Promise<string> {
  const userId = await currentUserId()
  if (!userId) throw new Error("Not authenticated")
  return userId
}
