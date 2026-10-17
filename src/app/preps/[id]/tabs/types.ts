import type { Prep, PrepImage, Question, Attempt } from "@prisma/client"

import type { SharedTabData } from "@/components/prep/tabs/sharedTabs"
import type { JobGeneration, PrepProgress } from "@/repositories/prepStateRepository"
import type { Page } from "@/types/prep"

/** A page's OCR verdict: recognised, or rejected with a plain-language reason. */
export type PageEntry =
  | { verdict: "accepted"; page: Page; generation: JobGeneration | null }
  | { verdict: "rejected"; imageId: string; number: number; gcsKey: string; reason: string; generation: JobGeneration | null }

/** Everything an owner tab may render; each tab component picks what it needs. */
export interface PrepTabProps extends SharedTabData {
  prep: Prep
  questions: Question[]
  attempts: Attempt[]
  /** Live: the server-rendered progress, updated by the run watcher. */
  progress: PrepProgress | null
  refreshProgress: () => Promise<void>
  expectRun: () => void
  pages: PageEntry[]
  images: PrepImage[]
  generations: Record<string, JobGeneration>
  onTitleReady: (title: string) => void
  onGenerated: (questions: Question[], prep: Prep) => void
}
