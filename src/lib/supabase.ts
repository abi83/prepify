import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const supabaseMisconfigured = !supabaseUrl || !supabaseAnonKey

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
)

export type PrepVisibility = 'private' | 'link' | 'public'

export type VisualElementType = 'diagram' | 'formula' | 'table' | 'chart' | 'molecule' | 'image'

export type VisualElement = {
  type: VisualElementType
  description: string
  content: string
  caption: string | null
  context: string | null
  confidence: number
}

export type Page = {
  page: number
  text: string
  visual_elements: VisualElement[]
}

export type Prep = {
  id: string
  user_id: string
  title: string
  pages: Page[]
  created_at: string
  tokens_used: number
  visibility: PrepVisibility
  grade: number | null
  discipline: string | null
  language: string | null
}
