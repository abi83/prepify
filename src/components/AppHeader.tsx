"use client"

import Link from "next/link"
import { signIn, signOut, useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import ThemeToggle from "@/components/ThemeToggle"

export default function AppHeader() {
  const { data: session } = useSession()

  return (
    <header className="flex items-center gap-6 border-b border-border px-6 py-3">
      <Link href="/" className="flex flex-col gap-0 leading-none">
        <span className="font-highlight text-base font-bold">Prepify</span>
        <span className="text-[10px] text-muted-foreground">School educational platform</span>
      </Link>

      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Link href="/catalog">Catalog</Link>
        </Button>
        {session && (
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <Link href="/preps">My Preps</Link>
          </Button>
        )}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {session ? (
          <>
            <span className="hidden text-sm text-muted-foreground sm:block">
              {session.user?.name ?? session.user?.email}
            </span>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link href="/settings">Settings</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => signOut({ redirectTo: "/" })}
            >
              Sign out
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => signIn("google", { redirectTo: "/preps" })}
          >
            Sign in
          </Button>
        )}
        <ThemeToggle />
      </div>
    </header>
  )
}
