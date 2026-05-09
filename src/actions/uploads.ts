"use server"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { enqueueProcessingJob } from "@/lib/processing/enqueue-job"
import {
  assertAllowedExtension,
  extensionFromFileName,
  maxBytesForUploadType,
  uploadFileTypeFromExtension,
} from "@/lib/uploads/file-type"
import { sanitizeFileName } from "@/lib/uploads/sanitize-file-name"

const BUCKET = "uploads"

export type PrepareUploadInput = {
  fileName: string
  fileSizeBytes: number
  subject?: string | null
}

export type PrepareUploadResult =
  | {
      ok: true
      uploadId: string
      storagePath: string
      signedUrl: string
    }
  | { ok: false; message: string }

export async function prepareUpload(
  input: PrepareUploadInput
): Promise<PrepareUploadResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, message: "You must be signed in to upload." }
  }

  const safeName = sanitizeFileName(input.fileName)
  const ext = extensionFromFileName(safeName)

  try {
    assertAllowedExtension(ext)
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Invalid file type.",
    }
  }

  const fileType = uploadFileTypeFromExtension(ext)
  const maxBytes = maxBytesForUploadType(fileType)

  if (input.fileSizeBytes > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024))
    return {
      ok: false,
      message: `File is too large for this type (max ${mb} MB).`,
    }
  }

  const uploadId = crypto.randomUUID()
  const storagePath = `${user.id}/${uploadId}/${safeName}`
  const subject =
    input.subject?.trim() && input.subject.trim().length > 0
      ? input.subject.trim()
      : null

  const { error: insertError } = await supabase.from("uploads").insert({
    id: uploadId,
    user_id: user.id,
    file_name: safeName,
    file_type: fileType,
    storage_path: storagePath,
    subject,
    status: "pending",
  })

  if (insertError) {
    console.error(insertError)
    return {
      ok: false,
      message: insertError.message || "Could not create upload record.",
    }
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signError || !signed?.signedUrl) {
    await supabase.from("uploads").delete().eq("id", uploadId)
    return {
      ok: false,
      message: signError?.message || "Could not start upload.",
    }
  }

  return {
    ok: true,
    uploadId,
    storagePath,
    signedUrl: signed.signedUrl,
  }
}

export type StartProcessingInput = {
  uploadId: string
}

export type StartProcessingResult =
  | { ok: true }
  | { ok: false; message: string }

export async function startProcessing(
  input: StartProcessingInput
): Promise<StartProcessingResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, message: "You must be signed in." }
  }

  const { data: row, error: fetchError } = await supabase
    .from("uploads")
    .select("id, user_id, storage_path, file_type, subject, status")
    .eq("id", input.uploadId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (fetchError || !row) {
    return { ok: false, message: "Upload not found." }
  }

  if (row.status !== "pending") {
    return { ok: true }
  }

  const { error: updateError } = await supabase
    .from("uploads")
    .update({
      status: "processing_parse",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  if (updateError) {
    return {
      ok: false,
      message: updateError.message || "Could not start processing.",
    }
  }

  enqueueProcessingJob({
    upload_id: row.id,
    storage_path: row.storage_path,
    file_type: row.file_type,
    subject: row.subject,
    user_id: user.id,
  })

  return { ok: true }
}
