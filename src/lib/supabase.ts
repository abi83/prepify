import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
)

export type PrepVisibility = 'private' | 'link' | 'public'

export type Prep = {
  id: string
  user_id: string
  title: string
  raw_text: string
  study_description: string | null
  created_at: string
  tokens_used: number
  visibility: PrepVisibility
  grade: number | null
  discipline: string | null
  language: string | null
}
