import { useRef, useState } from 'react'
import OpenAI from 'openai'
import { supabase } from '../lib/supabase'
import { getApiKey } from '../lib/apiKey'
import styles from './UploadModal.module.css'

type Props = {
  onClose: () => void
  onDone: (prepId: string) => void
}

type Phase = 'idle' | 'ocr' | 'saving' | 'error'

type OcrResult = { text: string; confidence: number; language: string }

async function extractTextFromImage(file: File, apiKey: string, model: string): Promise<{ text: string; language: string }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${file.type};base64,${base64}`, detail: 'high' },
          },
          {
            type: 'text',
            text: `Extract as much text as you can see from this textbook page. Do your best even if the image is imperfect.

Respond with JSON only:
{
  "text": "<extracted text, preserving structure and line breaks>",
  "confidence": <0.0–1.0>,
  "language": "<ISO 639-1 code of the text language, e.g. en, de, fr, it, es, pl>"
}

Confidence rubric:
- 0.9–1.0: Sharp image, all text clearly readable
- 0.7–0.9: Mostly readable, minor blur or cropping
- 0.5–0.7: Partial — some words/lines unclear or missing
- 0.0–0.5: Poor quality — large portions unreadable`,
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    service_tier: 'flex',
  })

  const raw = response.choices[0]?.message?.content?.trim() ?? ''
  const parsed: OcrResult = JSON.parse(raw)

  if (parsed.confidence < 0.5) {
    throw new Error(`low_confidence:${parsed.confidence}`)
  }

  return { text: parsed.text, language: parsed.language ?? 'en' }
}

export default function UploadModal({ onClose, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleFile(file: File) {
    setPhase('ocr')

    const config = getApiKey()
    if (!config) {
      setPhase('error')
      setErrorMsg('No API key configured. Please set one in Settings.')
      return
    }

    let ocrResult: { text: string; language: string } | undefined
    try {
      ocrResult = await extractTextFromImage(file, config.key, config.model)
    } catch (err) {
      setPhase('error')
      const msg = err instanceof Error ? err.message : ''
      setErrorMsg(
        msg.startsWith('low_confidence')
          ? 'Image too blurry or dark to read reliably. Please try a clearer photo.'
          : 'OCR failed. Please try again.'
      )
      return
    }

    if (!ocrResult.text) {
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
        .insert({ user_id: user.id, title, raw_text: ocrResult.text, language: ocrResult.language })
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
        )}

        {phase === 'ocr' && (
          <div className={styles.progress}>
            <div className={styles.progressLabel}>Recognising text…</div>
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: '100%' }} />
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
