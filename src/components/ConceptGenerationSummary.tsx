import type { JobGeneration } from "@/repositories/prepStateRepository"

import GenerationCost from "./GenerationCost"

/** Generation cost of the concepts, summed over their jobs. */
export default function ConceptGenerationSummary({ generations }: { generations: JobGeneration[] }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Concept generation</h3>
      <GenerationCost generations={generations} />
    </section>
  )
}
