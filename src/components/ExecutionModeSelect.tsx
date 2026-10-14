"use client"

import { EXECUTION_MODES, EXECUTION_MODE_INFO, isExecutionMode, type ExecutionMode } from "@/lib/executionMode"

import { Label } from "./ui/label"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"

interface Props {
  value: ExecutionMode
  onChange: (mode: ExecutionMode) => void
}

export function ExecutionModeSelect({ value, onChange }: Props) {
  return (
    <RadioGroup
      value={value}
      onValueChange={next => { if (isExecutionMode(next)) onChange(next) }}
      className="gap-3"
    >
      {EXECUTION_MODES.map(mode => {
        const { label, facts } = EXECUTION_MODE_INFO[mode]
        return (
          <Label
            key={mode}
            htmlFor={`execution-mode-${mode}`}
            className="items-start gap-3 rounded-sm border border-border bg-background p-3.5 font-normal has-data-[state=checked]:border-primary"
          >
            <RadioGroupItem id={`execution-mode-${mode}`} value={mode} className="mt-0.5" />
            <span className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{label}</span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {facts.map(fact => (
                  <div key={fact.name} className="contents">
                    <dt className="font-medium">{fact.name}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </span>
          </Label>
        )
      })}
    </RadioGroup>
  )
}
