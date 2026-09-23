"use client"

import { ChevronDownIcon, LogOutIcon, SettingsIcon } from "lucide-react"
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

function Avatar({ src, abbr }: { src: string | null | undefined; abbr: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={abbr}
        className="size-6 shrink-0 rounded-full"
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
      {abbr}
    </span>
  )
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
          <Avatar src={session.user?.image} abbr={abbr} />
          <span className="hidden max-w-[120px] truncate sm:block">{label}</span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ redirectTo: "/" })}
        >
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
