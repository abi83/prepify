import { CardBadge, CardBadges, CardFooter, CardStatic, CardTitle } from "@/components/ui/card"
import { formatDate } from "@/lib/format"
import type { StatedConcept } from "@/repositories/prepStateRepository"

export default function ConceptCard({ concept }: { concept: StatedConcept }) {
  return (
    <CardStatic>
      <CardBadges>
        <CardBadge className="uppercase">{concept.language}</CardBadge>
      </CardBadges>
      <CardTitle>{concept.name}</CardTitle>
      <p className="text-sm">{concept.description}</p>
      <div
        role="meter"
        aria-label="Importance"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={concept.importance}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary" style={{ width: `${Math.round(concept.importance * 100)}%` }} />
      </div>
      {concept.misconceptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">Misconceptions</span>
          <ul className="list-disc pl-5 text-sm">
            {concept.misconceptions.map(m => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}
      <CardFooter>
        <span className="text-xs text-muted-foreground">{formatDate(concept.createdAt)}</span>
      </CardFooter>
    </CardStatic>
  )
}
