import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Prep } from '../lib/supabase'
import UploadModal from '../components/UploadModal'
import styles from './MyPreps.module.css'

export default function MyPreps() {
  const [preps, setPreps] = useState<Prep[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const navigate = useNavigate()

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
    navigate(`/preps/${prepId}`)
  }

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>Prepify</span>
        <button className={styles.signOut} onClick={signOut}>Sign out</button>
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
              <li key={prep.id}>
                <button className={styles.item} onClick={() => navigate(`/preps/${prep.id}`)}>
                  <span className={styles.itemTitle}>{prep.title}</span>
                  <span className={styles.itemDate}>{formatDate(prep.created_at)}</span>
                </button>
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
