"use client"

import type { Prep } from "@prisma/client"
import { useRouter } from "next/navigation"

import ShareModal from "@/components/ShareModal"
import { getApiKey } from "@/lib/apiKey"
import { disciplineFromEnum, disciplineToEnum } from "@/lib/disciplineMapping"
import type { StatedConcept } from "@/repositories/prepStateRepository"

interface Props {
  prep: Prep
  concepts: StatedConcept[]
  onSaved: (prep: Prep) => void
  onClose: () => void
}

export default function SharePrepDialog({ prep, concepts, onSaved, onClose }: Props) {
  const router = useRouter()
  const keyConfig = getApiKey()

  return (
    <ShareModal
      prepId={prep.id}
      concepts={concepts}
      apiKey={keyConfig?.key ?? ""}
      model={keyConfig?.model ?? "gpt-5-nano"}
      tier={keyConfig?.tier ?? "flex"}
      initialVisibility={prep.visibility}
      initialGrade={prep.grade}
      initialDiscipline={disciplineFromEnum(prep.discipline)}
      onSave={(visibility, grade, discipline) => {
        onSaved({ ...prep, visibility, grade, discipline: disciplineToEnum(discipline) })
        router.refresh()
      }}
      onClose={onClose}
    />
  )
}
