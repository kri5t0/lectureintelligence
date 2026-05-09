import { after } from "next/server"

export type ProcessingJobPayload = {
  upload_id: string
  storage_path: string
  file_type: string
  subject: string | null
  user_id: string
}

export function enqueueProcessingJob(payload: ProcessingJobPayload) {
  const base = process.env.PYTHON_SERVICE_URL?.replace(/\/$/, "")
  const apiKey = process.env.INTERNAL_API_KEY

  if (!base || !apiKey) {
    console.warn(
      "PYTHON_SERVICE_URL or INTERNAL_API_KEY missing; processing job not enqueued"
    )
    return
  }

  after(async () => {
    try {
      const res = await fetch(`${base}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
        },
        body: JSON.stringify({
          upload_id: payload.upload_id,
          storage_path: payload.storage_path,
          file_type: payload.file_type,
          subject: payload.subject,
          user_id: payload.user_id,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error("Processing service error:", res.status, text)
      }
    } catch (e) {
      console.error("Failed to reach processing service:", e)
    }
  })
}
