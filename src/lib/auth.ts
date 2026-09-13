import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { jwtCallback, sessionCallback } from './authCallbacks'
import { env } from './env'

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    jwt: jwtCallback,
    session: sessionCallback,
  },
})
