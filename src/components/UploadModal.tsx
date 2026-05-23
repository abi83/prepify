import { useRef, useState } from 'react'
import Tesseract from 'tesseract.js'
import { supabase } from '../lib/supabase'
import { getOcrLanguage, setOcrLanguage, OCR_LANGUAGES } from '../lib/ocrLanguage'
import styles from './UploadModal.module.css'

type Props = {
  onClose: () => void
  onDone: (prepId: string) => void
}

type Phase = 'idle' | 'ocr' | 'saving' | 'error'

export default function UploadModal({ onClose, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [language, setLanguage] = useState(getOcrLanguage)

  function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = e.target.value
    setLanguage(code)
    setOcrLanguage(code)
  }

  async function handleFile(file: File) {
    setPhase('ocr')
    setProgress(0)

    let rawText = ''
    try {
      const worker = await Tesseract.createWorker(language, 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100))
          }
        },
      })
      const { data } = await worker.recognize(file)
      rawText = data.text.trim()
      await worker.terminate()
    } catch {
      setPhase('error')
      setErrorMsg('OCR failed. Please try a clearer image.')
      return
    }

    if (!rawText) {
      setPhase('error')
      setErrorMsg('No text detected. Please try a clearer image.')
      return
    }

    setPhase('saving')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { count } = await supabase
        .from('preps')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      const title = `Prep #${(count ?? 0) + 1}`

      const { data, error } = await supabase
        .from('preps')
        .insert({ user_id: user.id, title, raw_text: rawText })
        .select('id')
        .single()

      if (error) throw error
      onDone(data.id)
    } catch {
      setPhase('error')
      setErrorMsg('Failed to save. Please try again.')
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const isWorking = phase === 'ocr' || phase === 'saving'

  return (
    <div className={styles.overlay} onClick={isWorking ? undefined : onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>New Prep</h2>
          {!isWorking && (
            <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
          )}
        </div>

        {phase === 'idle' && (
          <>
            <div className={styles.langRow}>
              <label className={styles.langLabel} htmlFor="ocr-lang">Language</label>
              <select
                id="ocr-lang"
                className={styles.langSelect}
                value={language}
                onChange={handleLanguageChange}
              >
                {OCR_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div
              className={styles.dropzone}
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
            >
              <span className={styles.dropIcon}>📄</span>
              <p className={styles.dropMain}>Upload a photo of a textbook page</p>
              <p className={styles.dropSub}>Tap to select · or drag & drop</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleChange}
              />
            </div>
          </>
        )}

        {phase === 'ocr' && (
          <div className={styles.progress}>
            <div className={styles.progressLabel}>Recognising text… {progress}%</div>
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {phase === 'saving' && (
          <div className={styles.progress}>
            <div className={styles.progressLabel}>Saving your prep…</div>
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: '100%' }} />
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className={styles.error}>
            <p>{errorMsg}</p>
            <button className={styles.retry} onClick={() => { setPhase('idle'); setErrorMsg('') }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
