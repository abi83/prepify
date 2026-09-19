export const STUDY_TABS = [ "cards", "quiz", "test" ] as const
export type StudyTab = (typeof STUDY_TABS)[number]

export function isStudyTab(value: string): value is StudyTab {
    return STUDY_TABS.some(tab => tab === value)
}

/** Reads the `tab` query param, falling back to the default for anything absent or invalid. */
export function parseStudyTab(value: string | null): StudyTab {
    return value !== null && isStudyTab(value) ? value : "cards"
}

export type VisualElementType = "diagram" | "formula" | "table" | "chart" | "molecule" | "image"

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
