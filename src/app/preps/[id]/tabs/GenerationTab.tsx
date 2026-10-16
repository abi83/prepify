import GenerationPanel from "@/app/preps/[id]/GenerationPanel"
import GenerationCost from "@/components/GenerationCost"

import type { PrepTabProps } from "./types"

export default function GenerationTab({ prep, questions, progress, generations, onTitleReady, onGenerated }: PrepTabProps) {
  const jobs = Object.values(generations)
  return (
    <div className="flex flex-col gap-6">
      <GenerationPanel
        prepId={prep.id}
        prepTitle={prep.title}
        initialProgress={progress}
        hasQuestions={questions.length > 0}
        onTitleReady={onTitleReady}
        onComplete={onGenerated}
      />
      <section className="flex flex-col gap-1.5">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Generation log</h2>
        {jobs.length === 0
          ? <p className="text-sm text-muted-foreground">No generation jobs yet.</p>
          : <GenerationCost generations={jobs} />}
      </section>
    </div>
  )
}
