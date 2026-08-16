'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import UploadModal from '../components/UploadModal'
import styles from './MyPreps.module.css'

export default function MyPreps() {
  const [preps, setPreps] = useState<Prep[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchPreps()
  }, [])

  async function fetchPreps() {
    setLoading(true)
    const { data } = await supabase
      .from('preps')
      .select('*')
      .order('created_at', { ascending: false })
    setPreps(data ?? [])
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  function handleDone(prepId: string) {
    setShowUpload(false)
    router.push(`/preps/${prepId}`)
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    await supabase.from('preps').delete().eq('id', id)
    setPreps(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>Prepify</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link href="/catalog" className={styles.navLink}>Catalog</Link>
          <button className={styles.signOut} onClick={() => router.push('/settings')} title="Settings">⚙</button>
          <button className={styles.signOut} onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h1>My Preps</h1>
          <button className={styles.newBtn} onClick={() => setShowUpload(true)}>
            + New Prep
          </button>
        </div>

        {loading ? (
          <div className={styles.spinner} />
        ) : preps.length === 0 ? (
          <div className={styles.empty}>
            <span>📚</span>
            <p>No preps yet.</p>
            <p className={styles.emptyHint}>Upload a photo of a textbook page to get started.</p>
            <button className={styles.newBtn} onClick={() => setShowUpload(true)}>
              Upload your first page
            </button>
          </div>
        ) : (
          <ul className={styles.list}>
            {preps.map(prep => (
              <li key={prep.id} className={styles.listItem}>
                <button className={styles.item} onClick={() => router.push(`/preps/${prep.id}`)}>
                  <span className={styles.itemTitle}>{prep.title}</span>
                  <span className={styles.itemDate}>{formatDate(prep.created_at)}</span>
                </button>
                {confirmDeleteId === prep.id ? (
                  <div className={styles.deleteConfirm}>
                    <span className={styles.deleteConfirmLabel}>Delete?</span>
                    <button className={styles.deleteConfirmYes} onClick={() => handleDelete(prep.id)} disabled={deleting}>
                      {deleting ? '…' : 'Yes'}
                    </button>
                    <button className={styles.deleteConfirmNo} onClick={() => setConfirmDeleteId(null)} disabled={deleting}>
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.deleteRowBtn}
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(prep.id) }}
                    title="Delete prep"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onDone={handleDone} />
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
