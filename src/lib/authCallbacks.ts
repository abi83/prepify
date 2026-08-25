import type { Session, Profile } from 'next-auth'
import type { JWT } from 'next-auth/jwt'

export function jwtCallback({ token, profile }: { token: JWT; profile?: Profile }): JWT {
  if (profile?.sub) token.sub = profile.sub
  return token
}

export function sessionCallback({ session, token }: { session: Session; token: JWT }): Session {
  if (token.sub) session.user.id = token.sub
  return session
}
