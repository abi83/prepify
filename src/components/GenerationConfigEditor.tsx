"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ALL_QUESTION_TYPES, TYPE_LABELS, type GenerationConfig } from "@/core/lib/generationConfig"
import { cn } from "@/lib/utils"
import type { QuestionType } from "@/types/questions"

interface Props {
  value: GenerationConfig
  onChange: (value: GenerationConfig) => void
  /** False when the question count is chosen elsewhere (e.g. "Add N more"). */
  editCount: boolean
}

/** Summary of the config a run will use, with a sheet to change it for this run. */
export function GenerationConfigEditor({ value, onChange, editCount }: Props) {
  const [ open, setOpen ] = useState(false)

  function toggleType(type: QuestionType) {
    const already = value.enabledTypes.includes(type)
    if (already && value.enabledTypes.length === 1) return
    onChange({ ...value, enabledTypes: already ? value.enabledTypes.filter(t => t !== type) : [ ...value.enabledTypes, type ] })
  }

  const typesSummary = value.enabledTypes.length === ALL_QUESTION_TYPES.length
    ? "All types"
    : value.enabledTypes.map(t => TYPE_LABELS[t]).join(", ")

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm border border-border bg-background px-3.5 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground sm:max-w-sm">
          <span className="flex-1">
            {editCount && `${value.questionCount} questions · `}
            {typesSummary}
          </span>
          <span className="text-xs opacity-60">Edit</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-lg p-5">
        <SheetHeader className="p-0">
          <SheetTitle>Generation settings</SheetTitle>
          <SheetDescription className="sr-only">Choose how many questions to generate and which types.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4">
          {editCount && (
            <div className="flex items-center gap-2.5">
              <Label className="min-w-[68px] text-xs font-semibold tracking-wide text-muted-foreground uppercase">Questions</Label>
              <Input
                type="number"
                min={5}
                max={20}
                value={value.questionCount}
                onChange={e => onChange({ ...value, questionCount: Math.min(20, Math.max(5, Number(e.target.value) || 10)) })}
                className="h-11 w-[84px]"
              />
              <span className="text-xs text-muted-foreground">5–20</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Types</Label>
            <div className="flex flex-col gap-1">
              {ALL_QUESTION_TYPES.map(type => {
                const checked = value.enabledTypes.includes(type)
                const isOnly = checked && value.enabledTypes.length === 1
                return (
                  <Label key={type} className={cn("min-h-11 gap-2 text-sm font-normal", isOnly && "cursor-not-allowed opacity-50")}>
                    <Checkbox checked={checked} disabled={isOnly} onCheckedChange={() => toggleType(type)} />
                    {TYPE_LABELS[type]}
                  </Label>
                )
              })}
            </div>
          </div>
          <Button className="h-11" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
