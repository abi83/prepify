"use client"

import { ChevronDownIcon } from "lucide-react"
import Link from "next/link"
import { signIn, signOut, useSession } from "next-auth/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function initials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) return name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()
  return (email?.[0] ?? "?").toUpperCase()
}

export default function UserMenu() {
  const { data: session } = useSession()

  if (!session) {
    return (
      <Button size="sm" onClick={() => signIn("google", { redirectTo: "/preps" })}>
        Sign in
      </Button>
    )
  }

  const label = session.user?.name ?? session.user?.email ?? "Account"
  const abbr = initials(session.user?.name, session.user?.email)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {abbr}
          </span>
          <span className="hidden max-w-[120px] truncate sm:block">{label}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-error focus:text-error"
          onClick={() => signOut({ redirectTo: "/" })}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
