import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, supabaseMisconfigured } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import Home from './pages/Home'
import MyPreps from './pages/MyPreps'
import PrepPage from './pages/PrepPage'
import StudyPage from './pages/StudyPage'
import SettingsPage from './pages/SettingsPage'
import CatalogPage from './pages/CatalogPage'

function AuthGuard({ session, children }: { session: Session | null; children: React.ReactNode }) {
  if (!session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (supabaseMisconfigured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '16px', padding: '24px', textAlign: 'center', fontFamily: 'monospace' }}>
        <div style={{ fontSize: '2rem' }}>⚙️</div>
        <h2 style={{ fontSize: '1.1rem' }}>Prepify — Supabase not configured</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '420px' }}>
          Copy <code>.env.example</code> to <code>.env.local</code> and fill in your Supabase project URL and anon key, then restart the dev server.
        </p>
        <pre style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', fontSize: '0.82rem', textAlign: 'left' }}>
{`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key`}
        </pre>
      </div>
    )
  }

  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={session ? <Navigate to="/preps" replace /> : <Home />} />
        <Route path="/preps" element={<AuthGuard session={session}><MyPreps /></AuthGuard>} />
        <Route path="/preps/:id" element={<AuthGuard session={session}><PrepPage /></AuthGuard>} />
        <Route path="/study/:id" element={<StudyPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/settings" element={<AuthGuard session={session}><SettingsPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
