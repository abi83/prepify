const MESSAGES: Record<string, string> = {
  ocr_text_too_short: "Too little text found on this page. Retake the photo closer and in focus.",
  ocr_text_not_letters: "The text isn't readable — mostly symbols or noise. Retake the photo in better light.",
  low_confidence: "The photo is too blurry or dark to read. Retake it sharper.",
  unsupported_language: "This page is in a language Prepify doesn't support yet.",
}

/** Plain-language reason for a stored `PrepImage.error` (`<code>:<detail>`). Unknown codes keep the raw code visible. */
export function describeOcrError(error: string): string {
  const code = error.split(":")[0]
  return MESSAGES[code] ?? `This page couldn't be read (${code}).`
}
