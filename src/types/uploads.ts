export type UploadStatus =
  | "pending"
  | "processing_parse"
  | "processing_ai"
  | "done"
  | "error"

export type UploadFileType = "pdf" | "pptx" | "audio"

export type UploadRow = {
  id: string
  user_id: string
  file_name: string
  file_type: UploadFileType
  storage_path: string
  subject: string | null
  status: UploadStatus
  chunk_count: number
  card_count: number
  error_message: string | null
  created_at: string
  updated_at: string
}
