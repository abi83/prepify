import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

import { jwtCallback, sessionCallback } from "./authCallbacks"
import { config } from "./env"

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
    session: { strategy: "jwt" },
    trustHost: true,
    callbacks: {
      jwt: jwtCallback,
      session: sessionCallback,
    },
  }))
}

type AnyFn = (...args: any[]) => any

export const GET = ((...args: any[]) => (getInstance().handlers.GET as AnyFn)(...args)) as NextAuthInstance["handlers"]["GET"]

export const POST = ((...args: any[]) => (getInstance().handlers.POST as AnyFn)(...args)) as NextAuthInstance["handlers"]["POST"]

export const auth = ((...args: any[]) => (getInstance().auth as AnyFn)(...args)) as NextAuthInstance["auth"]

export const signIn = ((...args: any[]) => (getInstance().signIn as AnyFn)(...args)) as NextAuthInstance["signIn"]

export const signOut = ((...args: any[]) => (getInstance().signOut as AnyFn)(...args)) as NextAuthInstance["signOut"]
