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
