import type { PrepVisibility } from "@prisma/client"
import { useState, useRef } from "react"
import { toast } from "sonner"

import { updatePrep } from "@/actions/preps"
import { DISCIPLINES, type Discipline } from "@/lib/agents/PrepMeta"
import { disciplineToEnum } from "@/lib/disciplineMapping"

import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

interface Props {
  prepId: string
  initialVisibility: PrepVisibility
  initialGrade: number | null
  initialDiscipline: Discipline | null
  onSave: (visibility: PrepVisibility, grade: number | null, discipline: Discipline | null) => void
  onClose: () => void
}

const GRADE_OPTIONS = Array.from({ length: 13 }, (_, i) => i + 1)
const UNSET = "__unset__"

export default function ShareModal({
  prepId,
  initialVisibility,
  initialGrade,
  initialDiscipline,
  onSave,
  onClose,
}: Props) {
  const [ visibility, setVisibility ] = useState<"link" | "public">(
    initialVisibility === "public" ? "public" : "link",
  )
  const [ grade, setGrade ] = useState<number | null>(initialGrade)
  const [ discipline, setDiscipline ] = useState<Discipline | null>(initialDiscipline)
  const [ saving, setSaving ] = useState(false)
  const [ copied, setCopied ] = useState(false)
  const [ saved, setSaved ] = useState(initialVisibility !== "private")
  // ShareModal is mounted/unmounted by its parent rather than opened via a
  // DialogTrigger, so Radix has no trigger element to return focus to on
  // close — capture it ourselves and restore it in onCloseAutoFocus below.
  const triggerRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)

  async function handleConfirm() {
    setSaving(true)
    try {
      await updatePrep(prepId, { visibility, grade, discipline: disciplineToEnum(discipline) })
      onSave(visibility, grade, discipline)
      setSaved(true)
      toast.success("Prep published")
    } catch (error) {
      toast.error("Could not publish prep")
      throw error
    } finally {
      setSaving(false)
    }
  }

  async function handleUnpublish() {
    setSaving(true)
    try {
      await updatePrep(prepId, { visibility: "private" })
      onSave("private", grade, discipline)
    } finally {
      setSaving(false)
    }
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/study/${prepId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const shareUrl = `${window.location.origin}/study/${prepId}`

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent
        onCloseAutoFocus={e => {
          e.preventDefault()
          triggerRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Share prep</DialogTitle>
          <DialogDescription className="sr-only">
            Choose who can access this prep and set its grade and subject.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col gap-3.5">
            <p className="text-sm text-muted-foreground">
              {visibility === "link" ? "Anyone with the link can study this prep." : "This prep is publicly listed."}
            </p>
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} className="text-xs" />
              <Button onClick={handleCopyLink} className="shrink-0">
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
            <Button
              variant="link"
              onClick={handleUnpublish}
              disabled={saving}
              className="h-auto self-start p-0 text-muted-foreground"
            >
              {saving ? "Saving…" : "Make private"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label>Visibility</Label>
              <div className="flex gap-2">
                {([ "link", "public" ] as const).map(v => (
                  <Button
                    key={v}
                    type="button"
                    variant={visibility === v ? "default" : "outline"}
                    aria-pressed={visibility === v}
                    onClick={() => setVisibility(v)}
                    className="flex-1"
                  >
                    {v === "link" ? "Link only" : "Public"}
                  </Button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {visibility === "link"
                  ? "Only people with the link can access this prep."
                  : "Listed publicly — anyone can find and study it."}
              </span>
            </div>

            <div className="flex gap-3">
              <div className="flex flex-col gap-2">
                <Label>Grade</Label>
                <Select
                  value={grade === null ? UNSET : String(grade)}
                  onValueChange={v => setGrade(v === UNSET ? null : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>—</SelectItem>
                    {GRADE_OPTIONS.map(g => (
                      <SelectItem key={g} value={String(g)}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <Label>Subject</Label>
                <Select
                  value={discipline ?? UNSET}
                  onValueChange={v => setDiscipline(v === UNSET ? null : (v as Discipline))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>—</SelectItem>
                    {DISCIPLINES.map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-1 flex justify-end gap-2.5">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={saving}>
                {saving ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
