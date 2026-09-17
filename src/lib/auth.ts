import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { jwtCallback, sessionCallback } from './authCallbacks'
import { config } from './env'

type NextAuthInstance = ReturnType<typeof NextAuth>

let _instance: NextAuthInstance | undefined

function getInstance(): NextAuthInstance {
  return (_instance ??= NextAuth({
    providers: [
      Google({
        clientId: config.AUTH_GOOGLE_CLIENT_ID,
        clientSecret: config.AUTH_GOOGLE_CLIENT_SECRET,
      }),
    ],
    session: { strategy: 'jwt' },
    trustHost: true,
    callbacks: {
      jwt: jwtCallback,
      session: sessionCallback,
    },
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = ((...args: any[]) => (getInstance().handlers.GET as AnyFn)(...args)) as NextAuthInstance['handlers']['GET']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = ((...args: any[]) => (getInstance().handlers.POST as AnyFn)(...args)) as NextAuthInstance['handlers']['POST']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = ((...args: any[]) => (getInstance().auth as AnyFn)(...args)) as NextAuthInstance['auth']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signIn = ((...args: any[]) => (getInstance().signIn as AnyFn)(...args)) as NextAuthInstance['signIn']
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const signOut = ((...args: any[]) => (getInstance().signOut as AnyFn)(...args)) as NextAuthInstance['signOut']
