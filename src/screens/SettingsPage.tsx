'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OpenAI from 'openai'
import { getApiKey, setApiKey, clearApiKey, AVAILABLE_MODELS } from '../lib/apiKey'
import type { ModelId } from '../lib/apiKey'
import { estimateCost, formatCost } from '../lib/apiKey'
import {
  getGenerationConfig, setGenerationConfig,
  ALL_QUESTION_TYPES, TYPE_LABELS,
} from '../lib/generationConfig'
import type { GenerationConfig } from '../lib/generationConfig'
import type { QuestionType } from '../types/questions'
import { getTotalTokens } from '../actions/preps'
import { cn } from '@/lib/utils'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

type TestState = 'idle' | 'testing' | 'ok' | 'invalid_key' | 'error'

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/preps'

  const [keyValue, setKeyValue] = useState('')
  const [model, setModel] = useState<ModelId>('gpt-5-nano')
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [totalTokens, setTotalTokens] = useState(0)

  const [genConfig, setGenConfig] = useState<GenerationConfig>(() => getGenerationConfig())
  const [genConfigSaved, setGenConfigSaved] = useState(false)

  useEffect(() => {
    const existing = getApiKey()
    if (existing) {
      setKeyValue(existing.key)
      setModel(existing.model)
    }
      getTotalTokens().then(setTotalTokens)
  }, [])

  function handleGenConfigSave() {
    setGenerationConfig(genConfig)
    setGenConfigSaved(true)
    setTimeout(() => setGenConfigSaved(false), 1500)
  }

  function toggleType(type: QuestionType) {
    setGenConfig(prev => {
      const already = prev.enabledTypes.includes(type)
      if (already && prev.enabledTypes.length === 1) return prev // enforce at-least-1
      return {
        ...prev,
        enabledTypes: already
          ? prev.enabledTypes.filter(t => t !== type)
          : [...prev.enabledTypes, type],
      }
    })
  }

  function handleSave() {
    if (!keyValue.trim()) return
    setApiKey(keyValue.trim(), model)
    setSaved(true)
    setTestState('idle')
    setTimeout(() => {
      setSaved(false)
      router.push(returnTo)
    }, 800)
  }

  function handleClear() {
    clearApiKey()
    setKeyValue('')
    setModel('gpt-5-nano')
    setSaved(false)
    setTestState('idle')
  }

  async function handleTestConnection() {
    if (!keyValue.trim()) return
    setTestState('testing')
    try {
      const client = new OpenAI({ apiKey: keyValue.trim(), dangerouslyAllowBrowser: true })
      await client.models.list()
      setTestState('ok')
    } catch (err) {
      if (err instanceof OpenAI.APIError && (err.status === 401 || err.status === 403)) {
        setTestState('invalid_key')
      } else {
        setTestState('error')
      }
    }
  }

  const hasKey = !!getApiKey()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border px-6 py-4">
        <Button variant="link" className="h-auto p-0 text-muted-foreground" onClick={() => router.push(returnTo)}>← Back</Button>
      </header>

      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-10 px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <section className="flex flex-col gap-4">
          <h2 className="text-base font-bold tracking-tight">OpenAI API Key</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your key is stored only in this browser and never sent to our servers.{' '}
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
              onChange={e => { setKeyValue(e.target.value); setSaved(false); setTestState('idle') }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Model</Label>
            <Select value={model} onValueChange={v => { setModel(v as ModelId); setSaved(false) }}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_MODELS.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button onClick={handleSave} disabled={!keyValue.trim()}>
              {saved ? '✓ Saved' : 'Save'}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!keyValue.trim() || testState === 'testing'}
            >
              {testState === 'testing' ? 'Testing…' : 'Test connection'}
            </Button>
            {hasKey && (
              <Button variant="link" className="ml-auto h-auto p-0 text-error" onClick={handleClear}>
                Remove key
              </Button>
            )}
          </div>

          {testState === 'ok' && (
            <p className="text-sm font-medium text-success">✓ Connection successful</p>
          )}
          {testState === 'invalid_key' && (
            <p className="text-sm text-error">Invalid API key — check your key and try again.</p>
          )}
          {testState === 'error' && (
            <p className="text-sm text-error">Connection failed — check your internet connection.</p>
          )}
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
                    className={cn('gap-1.5 text-sm font-normal', isOnly && 'cursor-not-allowed opacity-50')}
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
              {genConfigSaved ? '✓ Saved' : 'Save defaults'}
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-base font-bold tracking-tight">Usage</h2>
          <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-4 py-3.5">
            <span className="text-sm text-muted-foreground">Total tokens (all preps)</span>
            <span className="text-sm font-semibold whitespace-nowrap">{totalTokens.toLocaleString()}</span>
          </div>
          {totalTokens > 0 && model && (
            <div className="flex items-center justify-between gap-3 rounded-sm border border-border bg-background px-4 py-3.5">
              <span className="text-sm text-muted-foreground">Estimated cost ({model})</span>
              <span className="text-sm font-semibold whitespace-nowrap">
                ~{formatCost(estimateCost(totalTokens * 0.8, totalTokens * 0.2, model))}
              </span>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
