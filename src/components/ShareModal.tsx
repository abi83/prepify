import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { PrepVisibility } from '../lib/supabase'
import { runPrepLabeler, DISCIPLINES } from '../lib/agents/PrepLabeler'
import type { Concept } from '../types/pipeline'
import styles from './ShareModal.module.css'

interface Props {
  prepId: string
  concepts: Concept[]
  apiKey: string
  model: string
  initialVisibility: PrepVisibility
  initialGrade: number | null
  initialDiscipline: string | null
  onSave: (visibility: PrepVisibility, grade: number | null, discipline: string | null) => void
  onClose: () => void
}

type LabelPhase = 'loading' | 'done' | 'error'

const GRADE_OPTIONS = Array.from({ length: 13 }, (_, i) => i + 1)

export default function ShareModal({
  prepId,
  concepts,
  apiKey,
  model,
  initialVisibility,
  initialGrade,
  initialDiscipline,
  onSave,
  onClose,
}: Props) {
  const [visibility, setVisibility] = useState<'link' | 'public'>(
    initialVisibility === 'public' ? 'public' : 'link',
  )
  const [grade, setGrade] = useState<number | null>(initialGrade)
  const [discipline, setDiscipline] = useState<string | null>(initialDiscipline)
  const [labelPhase, setLabelPhase] = useState<LabelPhase>('loading')
  const [lowConfidence, setLowConfidence] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(initialVisibility !== 'private')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (initialVisibility !== 'private') {
      setLabelPhase('done')
      return
    }
    if (initialGrade !== null || initialDiscipline !== null) {
      setLabelPhase('done')
      return
    }
    if (!concepts.length || !apiKey) {
      setLabelPhase('done')
      return
    }

    const ac = new AbortController()
    abortRef.current = ac

    runPrepLabeler(concepts, apiKey, model, ac.signal).then(result => {
      if (ac.signal.aborted) return
      setGrade(prev => prev ?? result.output.grade)
      setDiscipline(prev => prev ?? result.output.discipline)
      setLowConfidence(result.output.confidence <= 0.5)
      setLabelPhase('done')
    }).catch(() => {
      if (!ac.signal.aborted) setLabelPhase('error')
    })

    return () => ac.abort()
  }, [])

  async function handleConfirm() {
    setSaving(true)
    const { error } = await supabase
      .from('preps')
      .update({ visibility, grade, discipline })
      .eq('id', prepId)
    setSaving(false)
    if (!error) {
      onSave(visibility, grade, discipline)
      setSaved(true)
    }
  }

  async function handleUnpublish() {
    setSaving(true)
    const { error } = await supabase
      .from('preps')
      .update({ visibility: 'private' })
      .eq('id', prepId)
    setSaving(false)
    if (!error) onSave('private', grade, discipline)
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/study/${prepId}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  const shareUrl = `${window.location.origin}/study/${prepId}`

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Share prep</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        {saved ? (
          <div className={styles.publishedBox}>
            <p className={styles.publishedText}>
              {visibility === 'link' ? 'Anyone with the link can study this prep.' : 'This prep is publicly listed.'}
            </p>
            <div className={styles.linkRow}>
              <input
                className={styles.linkInput}
                readOnly
                value={shareUrl}
                onFocus={e => e.currentTarget.select()}
              />
              <button className={styles.copyBtn} onClick={handleCopyLink}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button className={styles.unpublishBtn} onClick={handleUnpublish} disabled={saving}>
              {saving ? 'Saving…' : 'Make private'}
            </button>
          </div>
        ) : (
          <>
            {labelPhase === 'loading' && (
              <div className={styles.labelingRow}>
                <span className={styles.dotPulse} />
                <span className={styles.labelingText}>Detecting subject and grade…</span>
              </div>
            )}

            {labelPhase === 'error' && (
              <p className={styles.hint}>Could not auto-detect subject — you can set it manually below.</p>
            )}

            {lowConfidence && labelPhase === 'done' && (
              <p className={styles.warning}>
                This material doesn't look like school curriculum. Grade and subject may not apply.
              </p>
            )}

            <div className={styles.field}>
              <label>Visibility</label>
              <div className={styles.visibilityGroup}>
                {(['link', 'public'] as const).map(v => (
                  <button
                    key={v}
                    className={`${styles.visBtn} ${visibility === v ? styles.visBtnActive : ''}`}
                    onClick={() => setVisibility(v)}
                  >
                    {v === 'link' ? 'Link only' : 'Public'}
                  </button>
                ))}
              </div>
              <span className={styles.visHint}>
                {visibility === 'link'
                  ? 'Only people with the link can access this prep.'
                  : 'Listed publicly — anyone can find and study it.'}
              </span>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label>Grade</label>
                <select
                  className={styles.select}
                  value={grade ?? ''}
                  onChange={e => setGrade(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">—</option>
                  {GRADE_OPTIONS.map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              <div className={`${styles.field} ${styles.fieldGrow}`}>
                <label>Subject</label>
                <select
                  className={styles.select}
                  value={discipline ?? ''}
                  onChange={e => setDiscipline(e.target.value || null)}
                >
                  <option value="">—</option>
                  {DISCIPLINES.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
              <button
                className={styles.publishBtn}
                onClick={handleConfirm}
                disabled={saving || labelPhase === 'loading'}
              >
                {saving ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
