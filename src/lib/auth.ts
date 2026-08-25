import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { jwtCallback, sessionCallback } from './authCallbacks'

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
})
