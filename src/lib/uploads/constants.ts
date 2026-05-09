/** Max size for slide decks (PDF / PPTX), bytes */
export const MAX_SLIDE_BYTES = 50 * 1024 * 1024

/** Max size for audio / video, bytes */
export const MAX_MEDIA_BYTES = 500 * 1024 * 1024

export const ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "pptx",
  "ppt",
  "mp4",
  "mov",
  "mp3",
  "m4a",
  "wav",
])
