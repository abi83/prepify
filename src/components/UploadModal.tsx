import { useEffect, useRef, useState } from 'react'
import OpenAI from 'openai'
import { supabase } from '../lib/supabase'
import type { VisualElement } from '../lib/supabase'
import { getApiKey } from '../lib/apiKey'
import { BYOK_TEXT_HARD_LIMIT } from '../lib/config'
import styles from './UploadModal.module.css'

const MAX_IMAGES = 10
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

type Props = {
  onClose: () => void
  onDone: (prepId: string) => void
}

type Phase = 'collect' | 'ocr' | 'saving' | 'error'

type OcrResult = {
  text: string
  confidence: number
  language: string
  visual_elements: VisualElement[]
}

async function extractTextFromImage(file: File, apiKey: string, model: string): Promise<{ text: string; language: string; visual_elements: VisualElement[] }> {
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
            text: `Extract as much text as you can see from this textbook page. Also describe any visual elements (diagrams, formulas, tables, charts, molecules, images). Do your best even if the image is imperfect.

Respond with JSON only:
{
  "text": "<extracted text, preserving structure and line breaks>",
  "confidence": <0.0–1.0>,
  "language": "<ISO 639-1 code of the text language, e.g. en, de, fr, it, es, pl>",
  "visual_elements": [
    {
      "type": "<diagram|formula|table|chart|molecule|image>",
      "description": "<plain-language description of what it shows>",
      "content": "<LaTeX for formulas, SMILES for molecules, Mermaid DSL for diagrams, markdown for tables, or descriptive text>",
      "caption": "<caption text visible on the page, or null>",
      "context": "<surrounding text that references this element, or null>",
      "confidence": <0.0–1.0 for this specific element>
    }
  ]
}

Confidence rubric (top-level):
- 0.9–1.0: Sharp image, all text clearly readable
- 0.7–0.9: Mostly readable, minor blur or cropping
- 0.5–0.7: Partial — some words/lines unclear or missing
- 0.0–0.5: Poor quality — large portions unreadable

If no visual elements are present, return an empty array for visual_elements.`,
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

  const elements = (parsed.visual_elements ?? []).filter(e => e.confidence >= 0.6)
  return { text: parsed.text, language: parsed.language ?? 'en', visual_elements: elements }
}

export default function UploadModal({ onClose, onDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('collect')

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])
  const [ocrProgress, setOcrProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [errorMsg, setErrorMsg] = useState('')

  function addFiles(incoming: FileList | null) {
    if (!incoming) return

    const validFiles: File[] = []
    const oversized: string[] = []

    for (const f of Array.from(incoming)) {
      if (f.size > MAX_FILE_BYTES) {
        oversized.push(f.name)
      } else {
        validFiles.push(f)
      }
    }

    if (oversized.length) {
      setPhase('error')
      setErrorMsg(`${oversized.join(', ')} ${oversized.length === 1 ? 'exceeds' : 'exceed'} the 5 MB limit. Please use smaller images.`)
      return
    }

    setFiles(prev => [...prev, ...validFiles].slice(0, MAX_IMAGES))
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleRecognise() {
    if (files.length === 0) return

    const config = getApiKey()
    if (!config) {
      setPhase('error')
      setErrorMsg('No API key configured. Please set one in Settings.')
      return
    }

    setPhase('ocr')
    setOcrProgress({ done: 0, total: files.length })

    let results: { text: string; language: string; visual_elements: VisualElement[] }[]
    try {
      results = await Promise.all(
        files.map(async (file, i) => {
          const result = await extractTextFromImage(file, config.key, config.model)
          setOcrProgress(p => ({ ...p, done: p.done + 1 }))
          return { ...result, index: i }
        })
      ) as { text: string; language: string; visual_elements: VisualElement[] }[]
    } catch (err) {
      setPhase('error')
      const msg = err instanceof Error ? err.message : ''
      setErrorMsg(
        msg.startsWith('low_confidence')
          ? 'One of the images is too blurry or dark to read reliably. Please replace it with a clearer photo.'
          : 'OCR failed. Please try again.'
      )
      return
    }

    const combinedText = results.map(r => r.text).join('\n\n')

    if (!combinedText.trim()) {
      setPhase('error')
      setErrorMsg('No text detected in any image. Please try clearer photos.')
      return
    }

    if (combinedText.length > BYOK_TEXT_HARD_LIMIT) {
      setPhase('error')
      setErrorMsg(`Extracted text exceeds the ${(BYOK_TEXT_HARD_LIMIT / 1000).toFixed(0)} 000 character limit. Please use fewer pages.`)
      return
    }

    const language = results[0]?.language ?? 'en'
    const allVisualElements = results.flatMap(r => r.visual_elements)

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
        .insert({
          user_id: user.id,
          title,
          raw_text: combinedText,
          language,
          visual_elements: allVisualElements.length > 0 ? allVisualElements : null,
        })
        .select('id')
        .single()

      if (error) throw error
      onDone(data.id)
    } catch {
      setPhase('error')
      setErrorMsg('Failed to save. Please try again.')
    }
  }

  const isWorking = phase === 'ocr' || phase === 'saving'
  const canAddMore = files.length < MAX_IMAGES

  return (
    <div className={styles.overlay} onClick={isWorking ? undefined : onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>New Prep</h2>
          {!isWorking && (
            <button className={styles.close} onClick={onClose} aria-label="Close">✕</button>
          )}
        </div>

        {phase === 'collect' && (
          <>
            {files.length === 0 ? (
              <div
                className={styles.dropzone}
                onClick={() => fileInputRef.current?.click()}
                onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                onDragOver={e => e.preventDefault()}
              >
                <span className={styles.dropIcon}>📄</span>
                <p className={styles.dropMain}>Upload photos of textbook pages</p>
                <p className={styles.dropSub}>Tap to select · or drag & drop</p>
              </div>
            ) : (
              <>
                <div className={styles.thumbGrid}>
                  {files.map((_, i) => (
                    <div key={i} className={styles.thumb}>
                      <img src={previews[i]} alt={`Page ${i + 1}`} className={styles.thumbImg} />
                      <button
                        className={styles.thumbRemove}
                        onClick={() => removeFile(i)}
                        aria-label={`Remove page ${i + 1}`}
                      >✕</button>
                      <span className={styles.thumbLabel}>{i + 1}</span>
                    </div>
                  ))}
                </div>

                {canAddMore && (
                  <div className={styles.addMoreRow}>
                    <button className={styles.addBtn} onClick={() => fileInputRef.current?.click()}>
                      + Add files
                    </button>
                    <button className={styles.addBtn} onClick={() => cameraInputRef.current?.click()}>
                      + Take photo
                    </button>
                    <span className={styles.addHint}>{files.length} / {MAX_IMAGES} pages</span>
                  </div>
                )}
              </>
            )}

            <div className={styles.mobileButtons}>
              {files.length === 0 && (
                <button className={styles.cameraBtn} onClick={() => cameraInputRef.current?.click()}>
                  Take photo
                </button>
              )}
              {files.length > 0 && (
                <button className={styles.recogniseBtn} onClick={handleRecognise}>
                  Recognise & Create
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = '' }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={e => { addFiles(e.target.files); e.target.value = '' }}
            />
          </>
        )}

        {phase === 'ocr' && (
          <div className={styles.progress}>
            <div className={styles.progressLabel}>
              Recognising image {ocrProgress.done + 1} of {ocrProgress.total}…
            </div>
            <div className={styles.bar}>
              <div
                className={styles.fill}
                style={{ width: `${ocrProgress.total > 0 ? (ocrProgress.done / ocrProgress.total) * 100 : 0}%` }}
              />
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
            <button className={styles.retry} onClick={() => { setPhase('collect'); setErrorMsg('') }}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
