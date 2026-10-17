import type { PrepVisibility } from "@prisma/client"

import { Card, CardBadge, CardBadges, CardFooter, CardSubtitle, CardTitle } from "@/components/ui/card"
import { LANGUAGE_LABELS } from "@/core/lib/config"
import { disciplineFromEnum } from "@/lib/disciplineMapping"
import { formatDate } from "@/lib/format"
import type { PrepEntry } from "@/repositories/prepRepository"

const VISIBILITY_BADGE: Record<PrepVisibility, { label: string; className: string }> = {
  private: { label: "private", className: "border-border text-muted-foreground" },
  link:    { label: "link only", className: "border-primary/40 bg-primary/10 text-primary" },
  public:  { label: "public", className: "border-success/40 bg-success/10 text-success" },
}

const PRIMARY_BADGE = "border-primary/40 bg-primary/10 text-primary"

interface Props {
  entry: PrepEntry
  href: string
  showVisibility: boolean
}

export function PrepEntryCard({ entry, href, showVisibility }: Props) {
  const discipline = disciplineFromEnum(entry.discipline)
  const visibility = VISIBILITY_BADGE[entry.visibility]
  return (
    <Card href={href}>
      <CardBadges>
        {showVisibility && <CardBadge className={visibility.className}>{visibility.label}</CardBadge>}
        {discipline && <CardBadge className={PRIMARY_BADGE}>{discipline}</CardBadge>}
        {entry.grade && <CardBadge className={PRIMARY_BADGE}>Grade {entry.grade}</CardBadge>}
        {entry.language && <CardBadge className={PRIMARY_BADGE}>{LANGUAGE_LABELS[entry.language]}</CardBadge>}
      </CardBadges>
      <CardTitle>{entry.title}</CardTitle>
      {entry.description && <CardSubtitle>{entry.description}</CardSubtitle>}
      <CardFooter>
        <span className="text-xs text-muted-foreground">
          {entry.questionCount} questions · {entry.flashcardCount} flashcards · {entry.conceptCount} concepts
        </span>
        <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
      </CardFooter>
    </Card>
  )
}
