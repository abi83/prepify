import { useState, useEffect } from 'react'
import { getApiKey, setApiKey, clearApiKey } from '../lib/apiKey'
import styles from './SettingsModal.module.css'

interface Props {
  onClose: () => void
}

export default function SettingsModal({ onClose }: Props) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)
  const existing = getApiKey()

  useEffect(() => {
    if (existing) setValue(existing.key)
  }, [])

  function handleSave() {
    if (!value.trim()) return
    setApiKey(value.trim())
    setSaved(true)
    setTimeout(onClose, 800)
  }

  function handleClear() {
    clearApiKey()
    setValue('')
    setSaved(false)
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Settings</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={styles.field}>
          <label>OpenAI API Key</label>
          <div className={styles.inputRow}>
            <input
              type="password"
              className={styles.input}
              placeholder="sk-..."
              value={value}
              onChange={e => { setValue(e.target.value); setSaved(false) }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <button className={styles.saveBtn} onClick={handleSave} disabled={!value.trim()}>
              Save
            </button>
          </div>
          <span className={styles.hint}>
            Used only in your browser. Never sent to our servers.{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
              Get a key →
            </a>
          </span>
        </div>

        {saved && <span className={styles.saved}>✓ Saved</span>}

        {existing && !saved && (
          <button className={styles.clearBtn} onClick={handleClear}>
            Remove saved key
          </button>
        )}
      </div>
    </div>
  )
}
