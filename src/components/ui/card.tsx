import Link from "next/link"
import * as React from "react"

import { cn } from "@/lib/utils"

const cardClasses =
  "flex h-full flex-col gap-2.5 rounded-lg border border-border bg-background p-5 text-inherit no-underline transition-[border-color,transform] hover:-translate-y-0.5 hover:border-primary"

interface CardProps {
  href: string
  className?: string
  children: React.ReactNode
}

export function Card({ href, className, children }: CardProps) {
  return (
    <Link href={href} className={cn(cardClasses, className)}>
      {children}
    </Link>
  )
}

export function CardBadges({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[22px] flex-wrap gap-1.5">{children}</div>
}

export function CardBadge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", className)}>
      {children}
    </span>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[0.97rem] leading-snug font-semibold">{children}</h3>
}

export function CardSubtitle({ children }: { children: React.ReactNode }) {
  return <p className="line-clamp-3 text-xs text-muted-foreground">{children}</p>
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto flex items-center justify-between gap-2 pt-1">{children}</div>
}
