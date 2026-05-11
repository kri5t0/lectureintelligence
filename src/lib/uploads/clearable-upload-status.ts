import type { UploadStatus } from "@/types/uploads"

/** Upload rows that are safe to bulk-remove (not successfully completed). */
export const CLEARABLE_UPLOAD_STATUSES = [
  "error",
  "pending",
  "processing_parse",
  "processing_ai",
] as const satisfies readonly UploadStatus[]

const CLEARABLE_STATUS_SET = new Set<string>(CLEARABLE_UPLOAD_STATUSES)

export function isClearableUploadStatus(status: UploadStatus): boolean {
  return CLEARABLE_STATUS_SET.has(status)
}
