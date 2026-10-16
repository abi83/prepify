"use client"

import { useState } from "react"

import { DEFAULT_EXECUTION_MODE, setExecutionMode, type ExecutionMode } from "@/lib/executionMode"

import { ExecutionModeSelect } from "./ExecutionModeSelect"
import { Button } from "./ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

interface Props {
  open: boolean
  onConfirm: (mode: ExecutionMode) => void
}

/** Shown once to first-time users before their first generation run. */
export function ExecutionModeDialog({ open, onConfirm }: Props) {
  const [ mode, setMode ] = useState<ExecutionMode>(DEFAULT_EXECUTION_MODE)

  function handleConfirm() {
    setExecutionMode(mode)
    onConfirm(mode)
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Where should your prep run?</DialogTitle>
          <DialogDescription>
            In-browser keeps your API key local. Server-assisted sends it once for resilient background processing. Change this any time in Settings.
          </DialogDescription>
        </DialogHeader>
        <ExecutionModeSelect value={mode} onChange={setMode} />
        <Button onClick={handleConfirm}>Continue</Button>
      </DialogContent>
    </Dialog>
  )
}
