import type { UploadFileType } from "@/types/uploads"
import {
  ALLOWED_EXTENSIONS,
  MAX_MEDIA_BYTES,
  MAX_SLIDE_BYTES,
} from "@/lib/uploads/constants"

export function extensionFromFileName(fileName: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim())
  return match ? match[1].toLowerCase() : null
}

export function assertAllowedExtension(ext: string | null): asserts ext is string {
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      "Unsupported file type. Use PDF, PPTX, or common audio/video formats."
    )
  }
}

export function uploadFileTypeFromExtension(ext: string): UploadFileType {
  if (ext === "pdf") return "pdf"
  if (ext === "pptx" || ext === "ppt") return "pptx"
  return "audio"
}

export function maxBytesForUploadType(fileType: UploadFileType): number {
  return fileType === "audio" ? MAX_MEDIA_BYTES : MAX_SLIDE_BYTES
}
