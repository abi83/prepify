import ConceptCard from "@/components/ConceptCard"
import ConceptGenerationSummary from "@/components/ConceptGenerationSummary"
import type { StatedConcept } from "@/repositories/prepStateRepository"

export default function ConceptsTab({ concepts }: { concepts: StatedConcept[] }) {
  if (concepts.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No concepts extracted yet.</p>

  const generations = [ ...new Map(concepts.map(c => [ c.generation.jobId, c.generation ])).values() ]
  return (
    <div className="flex flex-col gap-5">
      <ul aria-label="Concepts" className="flex flex-col gap-3">
        {concepts.map(c => (
          <li key={c.id}><ConceptCard concept={c} /></li>
        ))}
      </ul>
      <ConceptGenerationSummary generations={generations} />
    </div>
  )
}
