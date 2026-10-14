"use client"

import type { ExecutionMode } from "@/lib/executionMode"

import { ExecutionModeSelect } from "./ExecutionModeSelect"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion"

interface Props {
  executionMode: ExecutionMode
  onExecutionModeChange: (mode: ExecutionMode) => void
}

/** Per-run overrides of saved preferences; collapsed by default. */
export function AdditionalSettings({ executionMode, onExecutionModeChange }: Props) {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="additional" className="border-b-0">
        <AccordionTrigger className="py-2 text-sm text-muted-foreground">Additional settings</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-2.5">
          <p className="text-xs text-muted-foreground">Execution mode for this run only. Change the default in Settings.</p>
          <ExecutionModeSelect value={executionMode} onChange={onExecutionModeChange} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
