import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import styles from './Home.module.css'

export default function Home() {
  const [loading, setLoading] = useState(false)

  async function signInWithGoogle() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  return (
    <main className={styles.root}>
      <div className={styles.hero}>
        <div className={styles.badge}>AI-powered study tool</div>
        <h1 className={styles.title}>
          Prepify
        </h1>
        <p className={styles.subtitle}>Turn any textbook page into a personal exam</p>
        <p className={styles.sub}>
          Snap a photo, and Test Preparer instantly creates flashcards,
          multiple-choice questions, and timed tests — just for you.
        </p>
        <button className={styles.cta} onClick={signInWithGoogle} disabled={loading}>
          {loading ? 'Redirecting…' : (
            <>
              <GoogleIcon />
              Sign in with Google
            </>
          )}
        </button>
        <p className={styles.note}>Free to start · No credit card required</p>
        <Link to="/catalog" className={styles.catalogLink}>Browse public study sets →</Link>
      </div>

      <div className={styles.features}>
        {FEATURES.map(f => (
          <div key={f.title} className={styles.card}>
            <span className={styles.icon}>{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </div>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

const FEATURES = [
  { icon: '📷', title: 'Snap & go', desc: 'Upload any textbook photo. Your image is sent to OpenAI Vision for OCR, then the text feeds the question pipeline.' },
  { icon: '🧠', title: 'AI-generated questions', desc: 'Flashcards, multiple-choice, and fill-in-the-blank questions crafted from exactly what you uploaded.' },
  { icon: '📊', title: 'Track your progress', desc: 'Take timed tests, see your scores, and revisit past sessions to study smarter over time.' },
]
