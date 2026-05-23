const STORAGE_KEY = 'prepify_ocr_lang'

export interface OcrLanguageOption {
  code: string
  label: string
}

export const OCR_LANGUAGES: OcrLanguageOption[] = [
  { code: 'eng', label: 'English' },
  { code: 'spa', label: 'Spanish' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'rus', label: 'Russian' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'ara', label: 'Arabic' },
]

const LOCALE_TO_TESSERACT: Record<string, string> = {
  en: 'eng',
  es: 'spa',
  fr: 'fra',
  de: 'deu',
  ru: 'rus',
  zh: 'chi_sim',
  ja: 'jpn',
  ko: 'kor',
  ar: 'ara',
}

function detectDefaultLanguage(): string {
  const locale = (navigator.language || 'en').split('-')[0].toLowerCase()
  return LOCALE_TO_TESSERACT[locale] ?? 'eng'
}

export function getOcrLanguage(): string {
  return localStorage.getItem(STORAGE_KEY) ?? detectDefaultLanguage()
}

export function setOcrLanguage(code: string): void {
  localStorage.setItem(STORAGE_KEY, code)
}
