import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import OpenAI from 'openai'
import { getApiKey, setApiKey, clearApiKey, AVAILABLE_MODELS } from '../lib/apiKey'
import type { ModelId } from '../lib/apiKey'
import {
  getGenerationConfig, setGenerationConfig,
  ALL_QUESTION_TYPES, TYPE_LABELS,
} from '../lib/generationConfig'
import type { GenerationConfig } from '../lib/generationConfig'
import type { QuestionType } from '../types/questions'
import { getTotalTokens, clearTokenUsage } from '../lib/tokenUsage'
import styles from './SettingsPage.module.css'

type TestState = 'idle' | 'testing' | 'ok' | 'invalid_key' | 'error'

export default function SettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/preps'

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
    setTotalTokens(getTotalTokens())
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
      navigate(returnTo)
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
    <div className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} onClick={() => navigate(returnTo)}>← Back</button>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Settings</h1>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>OpenAI API Key</h2>
          <p className={styles.hint}>
            Your key is stored only in this browser and never sent to our servers.{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className={styles.link}
            >
              Get a key →
            </a>
          </p>

          <div className={styles.field}>
            <label className={styles.label}>API Key</label>
            <input
              type="password"
              className={styles.input}
              placeholder="sk-..."
              value={keyValue}
              onChange={e => { setKeyValue(e.target.value); setSaved(false); setTestState('idle') }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoComplete="off"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Model</label>
            <select
              className={styles.select}
              value={model}
              onChange={e => { setModel(e.target.value as ModelId); setSaved(false) }}
            >
              {AVAILABLE_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.actions}>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={!keyValue.trim()}
            >
              {saved ? '✓ Saved' : 'Save'}
            </button>
            <button
              className={styles.testBtn}
              onClick={handleTestConnection}
              disabled={!keyValue.trim() || testState === 'testing'}
            >
              {testState === 'testing' ? 'Testing…' : 'Test connection'}
            </button>
            {hasKey && (
              <button className={styles.clearBtn} onClick={handleClear}>
                Remove key
              </button>
            )}
          </div>

          {testState === 'ok' && (
            <p className={styles.testSuccess}>✓ Connection successful</p>
          )}
          {testState === 'invalid_key' && (
            <p className={styles.testError}>Invalid API key — check your key and try again.</p>
          )}
          {testState === 'error' && (
            <p className={styles.testError}>Connection failed — check your internet connection.</p>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Generation defaults</h2>
          <p className={styles.hint}>
            These apply to all new generations. You can override them per prep before hitting Generate.
          </p>

          <div className={styles.field}>
            <label className={styles.label}>Questions per prep</label>
            <input
              type="number"
              className={styles.input}
              min={5}
              max={20}
              value={genConfig.questionCount}
              onChange={e => setGenConfig(prev => ({
                ...prev,
                questionCount: Math.min(20, Math.max(5, Number(e.target.value) || 10)),
              }))}
              style={{ maxWidth: 90 }}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Question types</label>
            <div className={styles.typeToggles}>
              {ALL_QUESTION_TYPES.map(type => {
                const isOnly = genConfig.enabledTypes.includes(type) && genConfig.enabledTypes.length === 1
                return (
                  <label
                    key={type}
                    className={`${styles.typeToggle} ${isOnly ? styles.typeToggleOnly : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={genConfig.enabledTypes.includes(type)}
                      disabled={isOnly}
                      onChange={() => toggleType(type)}
                    />
                    {TYPE_LABELS[type]}
                  </label>
                )
              })}
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.saveBtn} onClick={handleGenConfigSave}>
              {genConfigSaved ? '✓ Saved' : 'Save defaults'}
            </button>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Usage</h2>
          <div className={styles.usageLine}>
            <span className={styles.usageLabel}>Total tokens consumed (all generations)</span>
            <span className={styles.usageValue}>{totalTokens.toLocaleString()}</span>
          </div>
          {totalTokens > 0 && (
            <button
              className={styles.clearUsageBtn}
              onClick={() => { clearTokenUsage(); setTotalTokens(0) }}
            >
              Reset counter
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
