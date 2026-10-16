import type { Prep } from "@prisma/client"
import { EllipsisIcon } from "lucide-react"

import { formatUsage } from "@/components/GenerationCost"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDate } from "@/lib/format"

interface Props {
  prep: Prep
  isOwner: boolean
  canShare: boolean
  tokensUsed: number
  costUsd: number
  onShare: () => void
  onDelete: () => void
}

export default function PrepHeader({ prep, isOwner, canShare, tokensUsed, costUsd, onShare, onDelete }: Props) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-highlight text-2xl font-bold tracking-tight">{prep.title}</h1>
        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mt-1 size-11 shrink-0" aria-label="Prep actions">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canShare && (
                <DropdownMenuItem className="min-h-11" onSelect={onShare}>
                  {prep.visibility === "private" ? "Share" : "Shared"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11" variant="destructive" onSelect={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {prep.description && <p className="text-sm text-muted-foreground">{prep.description}</p>}
      <span className="text-sm text-muted-foreground">{formatDate(prep.createdAt)}</span>
      {tokensUsed > 0 && <span className="text-xs text-muted-foreground">{formatUsage(tokensUsed, costUsd)}</span>}
    </header>
  )
}
