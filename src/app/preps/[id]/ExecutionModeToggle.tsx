"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface Props {
  serverMode: boolean
  onChange: (serverMode: boolean) => void
}

export function ExecutionModeToggle({ serverMode, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="gap-1.5 text-sm font-normal">
        <Checkbox checked={serverMode} onCheckedChange={checked => onChange(checked === true)} />
        Run on the server (you can close the tab)
      </Label>
      <p className="text-xs text-muted-foreground">
        {serverMode
          ? "Your key is sent once and used only in server memory for this run; it is never stored."
          : "Runs in this tab; your key never leaves the browser."}
      </p>
    </div>
  )
}
