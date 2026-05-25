/**
 * Splits text into overlapping chunks on word boundaries.
 * Overlap prevents concepts that straddle a boundary from being split across chunks.
 */
export function chunkText(text: string, size: number, overlap: number): string[] {
  if (text.length <= size) return [text]

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + size

    if (end < text.length) {
      // Walk back to the nearest word boundary so we don't cut mid-word
      const boundary = text.lastIndexOf(' ', end)
      if (boundary > start) end = boundary
    } else {
      end = text.length
    }

    chunks.push(text.slice(start, end))

    // Next chunk starts before the end of this one by `overlap` chars,
    // aligned to a word boundary walking forward
    const nextStart = end - overlap
    const boundary = text.indexOf(' ', nextStart)
    start = boundary > start && boundary < end ? boundary + 1 : end
  }

  return chunks
}
