'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseMisconfigured } from './supabase'

const SessionContext = createContext<Session | null>(null)

export function useSession() {
  return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
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
{`NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key`}
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

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
