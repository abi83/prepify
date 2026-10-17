"use client"

import Link from "next/link"
import { useSyncExternalStore } from "react"

import { getApiKey } from "@/lib/apiKey"
import { EXECUTION_MODE_INFO, getExecutionMode, isExecutionModeSet } from "@/lib/executionMode"

const subscribe = () => () => {}

function describeRun(): string {
  const key = getApiKey()
  if (!key) return ""
  const model = `${key.model} · ${key.tier}`
  return isExecutionModeSet() ? `${model} · ${EXECUTION_MODE_INFO[getExecutionMode()].label}` : model
}

/** The model, tier and execution mode a run will use; they're only changeable in Settings. */
export function RunSettingsHint({ returnTo }: { returnTo: string }) {
  const description = useSyncExternalStore(subscribe, describeRun, () => "")
  if (!description) return null

  return (
    <p className="text-xs text-muted-foreground">
      {description} ·{" "}
      <Link href={`/settings?returnTo=${encodeURIComponent(returnTo)}`} className="underline">Change in Settings</Link>
    </p>
  )
}
