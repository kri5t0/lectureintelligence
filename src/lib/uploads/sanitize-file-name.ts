export function sanitizeFileName(raw: string): string {
  const base = raw.replace(/^.*[/\\]/, "").trim()
  const cleaned = base.replace(/[^\w.\- ()\[\]]+/g, "_").slice(0, 200)
  return cleaned.length > 0 ? cleaned : "upload"
}
