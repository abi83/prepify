"use client"

import type { Prep } from "@prisma/client"
import { useRouter } from "next/navigation"

import ShareModal from "@/components/ShareModal"
import { disciplineFromEnum, disciplineToEnum } from "@/lib/disciplineMapping"

interface Props {
  prep: Prep
  onSaved: (prep: Prep) => void
  onClose: () => void
}

export default function SharePrepDialog({ prep, onSaved, onClose }: Props) {
  const router = useRouter()

  return (
    <ShareModal
      prepId={prep.id}
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
