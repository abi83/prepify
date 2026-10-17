"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"

import { getTotalCost, getTotalTokens } from "@/actions/preps"
import { ExecutionModeSelect } from "@/components/ExecutionModeSelect"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getApiKey, setApiKey, clearApiKey, DEFAULT_MODEL, DEFAULT_TIER } from "@/lib/apiKey"
import { getExecutionMode, setExecutionMode, type ExecutionMode } from "@/lib/executionMode"
import type { GenerationConfig } from "@/lib/generationConfig"
import {
  getGenerationConfig, setGenerationConfig,
  ALL_QUESTION_TYPES, TYPE_LABELS,
} from "@/lib/generationConfig"
import { OpenAiLlm } from "@/lib/llm/openAiLlm"
import { providerModels } from "@/lib/modelCatalog"
import { formatCost } from "@/lib/pricing"
import { cn } from "@/lib/utils"
import type { ModelCatalog } from "@/types/modelCatalog"
import type { QuestionType } from "@/types/questions"

type TestState = "idle" | "testing" | "ok" | "invalid_key" | "error"

export default function SettingsPage({ catalog }: { catalog: ModelCatalog }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo") ?? "/preps"

  const [ keyValue, setKeyValue ] = useState(() => getApiKey()?.key ?? "")
  const [ model, setModel ] = useState(() => getApiKey()?.model ?? DEFAULT_MODEL)
  const [ tier, setTier ] = useState(() => getApiKey()?.tier ?? DEFAULT_TIER)
  const [ saved, setSaved ] = useState(false)
  const [ testState, setTestState ] = useState<TestState>("idle")
  const [ totalTokens, setTotalTokens ] = useState(0)
  const [ totalCost, setTotalCost ] = useState(0)

  const [ genConfig, setGenConfig ] = useState<GenerationConfig>(() => getGenerationConfig())
  const [ genConfigSaved, setGenConfigSaved ] = useState(false)
  const [ executionMode, setExecutionModeState ] = useState<ExecutionMode>(() => getExecutionMode())

  useEffect(() => {
    getTotalTokens().then(setTotalTokens)
    getTotalCost().then(setTotalCost)
  }, [])

  function handleGenConfigSave() {
    setGenerationConfig(genConfig)
    setGenConfigSaved(true)
    setTimeout(() => setGenConfigSaved(false), 1500)
  }

  function handleExecutionModeChange(mode: ExecutionMode) {
    setExecutionMode(mode)
    setExecutionModeState(mode)
  }

  function toggleType(type: QuestionType) {
    setGenConfig(prev => {
      const already = prev.enabledTypes.includes(type)
      if (already && prev.enabledTypes.length === 1) return prev // enforce at-least-1
      return {
        ...prev,
        enabledTypes: already
          ? prev.enabledTypes.filter(t => t !== type)
          : [ ...prev.enabledTypes, type ],
      }
    })
  }

  function handleSave() {
    if (!keyValue.trim()) return
    setApiKey(keyValue.trim(), model, tier)
    setSaved(true)
    setTestState("idle")
    setTimeout(() => {
      setSaved(false)
      router.push(returnTo)
    }, 800)
  }

  function handleClear() {
    clearApiKey()
    setKeyValue("")
    setModel(DEFAULT_MODEL)
    setTier(DEFAULT_TIER)
    setSaved(false)
    setTestState("idle")
  }

  async function handleTestConnection() {
    if (!keyValue.trim()) return
    setTestState("testing")
    try {
      const valid = await new OpenAiLlm({ apiKey: keyValue.trim() }).isKeyValid()
      setTestState(valid ? "ok" : "invalid_key")
    } catch {
      setTestState("error")
    }
  }

  const hasKey = !!getApiKey()
  const models = providerModels(catalog, "openai")
  const selected = models.find(m => m.id === model)
  const selectionError = !selected
    ? `Saved model "${model}" is no longer available.`
    : !(tier in selected.tiers) ? `Saved tier "${tier}" is not available for ${selected.label}.` : null
  const tiers = selected ? Object.entries(selected.tiers) : []

  function handleModelChange(next: string) {
    setModel(next)
    setSaved(false)
  }

  function handleResetSelection() {
    setModel(DEFAULT_MODEL)
    setTier(DEFAULT_TIER)
    setSaved(false)
  }

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-10 px-6 py-10">
      <div className="flex items-center justify-between">
        <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => router.push(returnTo)}>← Back</Button>
      </div>
      <h1 className="font-highlight text-2xl font-bold tracking-tight">Settings</h1>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold tracking-tight">OpenAI API Key</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
            Your key is stored only in this browser and never sent to our servers.{" "}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
              Get a key →
          </a>
        </p>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">API Key</Label>
          <Input
            type="password"
            placeholder="sk-..."
            value={keyValue}
            onChange={e => { setKeyValue(e.target.value); setSaved(false); setTestState("idle") }}
            onKeyDown={e => e.key === "Enter" && handleSave()}
            autoComplete="off"
          />
        </div>

        {selectionError && (
          <div role="alert" className="flex flex-col items-start gap-2.5">
            <p className="text-sm text-error">{selectionError} Reset to the defaults to continue.</p>
            <Button variant="outline" onClick={handleResetSelection}>Reset model and tier</Button>
          </div>
        )}

        {!selectionError && <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Model</Label>
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>}

        {!selectionError && <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Service tier</Label>
          <Select value={tier} onValueChange={v => { setTier(v); setSaved(false) }}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiers.map(([ id, t ]) => (
                <SelectItem key={id} value={id}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button onClick={handleSave} disabled={!keyValue.trim() || !!selectionError}>
            {saved ? "✓ Saved" : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!keyValue.trim() || testState === "testing"}
          >
            {testState === "testing" ? "Testing…" : "Test connection"}
          </Button>
          {hasKey && (
            <Button variant="link" className="ml-auto h-auto p-0 text-error" onClick={handleClear}>
                Remove key
            </Button>
          )}
        </div>

        {testState === "ok" && (
          <p className="text-sm font-medium text-success">✓ Connection successful</p>
        )}
        {testState === "invalid_key" && (
          <p className="text-sm text-error">Invalid API key — check your key and try again.</p>
        )}
        {testState === "error" && (
          <p className="text-sm text-error">Connection failed — check your internet connection.</p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold tracking-tight">Execution mode</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Where OCR and generation run. Saved in this browser; you can override it per run.
        </p>
        <ExecutionModeSelect value={executionMode} onChange={handleExecutionModeChange} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold tracking-tight">Generation defaults</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
            These apply to all new generations. You can override them per prep before hitting Generate.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Questions per prep</Label>
          <Input
            type="number"
            min={5}
            max={20}
            value={genConfig.questionCount}
            onChange={e => setGenConfig(prev => ({
              ...prev,
              questionCount: Math.min(20, Math.max(5, Number(e.target.value) || 10)),
            }))}
            className="max-w-[90px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Question types</Label>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {ALL_QUESTION_TYPES.map(type => {
              const isOnly = genConfig.enabledTypes.includes(type) && genConfig.enabledTypes.length === 1
              return (
                <Label
                  key={type}
                  className={cn("gap-1.5 text-sm font-normal", isOnly && "cursor-not-allowed opacity-50")}
                >
                  <Checkbox
                    checked={genConfig.enabledTypes.includes(type)}
                    disabled={isOnly}
                    onCheckedChange={() => toggleType(type)}
                  />
                  {TYPE_LABELS[type]}
                </Label>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button onClick={handleGenConfigSave}>
            {genConfigSaved ? "✓ Saved" : "Save defaults"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base font-bold tracking-tight">Usage</h2>
        <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-4 py-3.5">
          <span className="text-sm text-muted-foreground">Total tokens (all preps)</span>
          <span className="text-sm font-semibold whitespace-nowrap">{totalTokens.toLocaleString()}</span>
        </div>
        {totalTokens > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-4 py-3.5">
            <span className="text-sm text-muted-foreground">Total cost</span>
            <span className="text-sm font-semibold whitespace-nowrap">{formatCost(totalCost)}</span>
          </div>
        )}
      </section>
    </main>
  )
}
