"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"

import ThemeToggle from "@/components/ThemeToggle"
import { Button } from "@/components/ui/button"
import UserMenu from "@/components/UserMenu"
import { cn } from "@/lib/utils"

export default function AppHeader() {
  const { data: session } = useSession()
  const pathname = usePathname()

  return (
    <header className="flex items-center gap-6 border-b border-border px-6 py-3">
      <Link href="/" className="flex flex-col gap-0 leading-none">
        <span className="font-highlight text-base font-bold">Prepify</span>
        <span className="text-[10px] text-muted-foreground">School educational platform</span>
      </Link>

      <nav className="hidden items-center gap-4 sm:flex">
        <Button asChild variant="ghost" size="sm" className={cn(
          pathname.startsWith("/catalog") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}>
          <Link href="/catalog">Catalog</Link>
        </Button>
        {session && (
          <Button asChild variant="ghost" size="sm" className={cn(
            pathname.startsWith("/preps") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}>
            <Link href="/preps">My Preps</Link>
          </Button>
        )}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}
