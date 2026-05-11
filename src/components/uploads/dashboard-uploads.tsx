"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Upload, FileUp } from "lucide-react"
import { clearProblemUploads, prepareUpload, startProcessing } from "@/actions/uploads"
import { isClearableUploadStatus } from "@/lib/uploads/clearable-upload-status"
import { uploadFileWithProgress } from "@/lib/uploads/upload-with-progress"
import { supabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { UploadRow } from "@/types/uploads"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

type OptimisticRow = {
  tempKey: string
  fileName: string
  uploadId?: string
  phase: "preparing" | "uploading" | "enqueueing"
  progress: number
  error?: string
}

function formatStatus(status: UploadRow["status"]) {
  switch (status) {
    case "pending":
      return "Queued"
    case "processing_parse":
      return "Parsing"
    case "processing_ai":
      return "Generating"
    case "done":
      return "Ready"
    case "error":
      return "Error"
    default:
      return status
  }
}

export function DashboardUploads({
  userId,
  initialUploads,
}: {
  userId: string
  initialUploads: UploadRow[]
}) {
  const router = useRouter()
  const [uploads, setUploads] = React.useState(initialUploads)
  const [optimistic, setOptimistic] = React.useState<OptimisticRow[]>([])
  const [subject, setSubject] = React.useState("")
  const [dragActive, setDragActive] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [clearMessage, setClearMessage] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const clearableCount = uploads.filter((u) =>
    isClearableUploadStatus(u.status)
  ).length

  React.useEffect(() => {
    setUploads(initialUploads)
  }, [initialUploads])

  React.useEffect(() => {
    const channel = supabase
      .channel(`uploads-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "uploads",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, router])

  const overlayByUploadId = React.useMemo(() => {
    const m = new Map<string, OptimisticRow>()
    for (const row of optimistic) {
      if (row.uploadId) m.set(row.uploadId, row)
    }
    return m
  }, [optimistic])

  async function processFile(file: File) {
    const tempKey = crypto.randomUUID()
    setOptimistic((prev) => [
      ...prev,
      {
        tempKey,
        fileName: file.name,
        phase: "preparing",
        progress: 0,
      },
    ])

    const prepared = await prepareUpload({
      fileName: file.name,
      fileSizeBytes: file.size,
      subject: subject.trim() || null,
    })

    if (!prepared.ok) {
      setOptimistic((prev) =>
        prev.map((r) =>
          r.tempKey === tempKey ? { ...r, error: prepared.message } : r
        )
      )
      return
    }

    setOptimistic((prev) =>
      prev.map((r) =>
        r.tempKey === tempKey
          ? {
              ...r,
              uploadId: prepared.uploadId,
              phase: "uploading",
              progress: 0,
            }
          : r
      )
    )
    router.refresh()

    try {
      await uploadFileWithProgress(prepared.signedUrl, file, (pct) => {
        setOptimistic((prev) =>
          prev.map((r) =>
            r.tempKey === tempKey ? { ...r, progress: pct } : r
          )
        )
      })
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Upload failed. Try again."
      setOptimistic((prev) =>
        prev.map((r) =>
          r.tempKey === tempKey ? { ...r, error: message } : r
        )
      )
      return
    }

    setOptimistic((prev) =>
      prev.map((r) =>
        r.tempKey === tempKey ? { ...r, phase: "enqueueing", progress: 100 } : r
      )
    )

    const started = await startProcessing({ uploadId: prepared.uploadId })
    if (!started.ok) {
      setOptimistic((prev) =>
        prev.map((r) =>
          r.tempKey === tempKey ? { ...r, error: started.message } : r
        )
      )
      return
    }

    setOptimistic((prev) => prev.filter((r) => r.tempKey !== tempKey))
    router.refresh()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    void Promise.all(files.map((f) => processFile(f)))
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    void Promise.all(Array.from(files).map((f) => processFile(f)))
    e.target.value = ""
  }

  async function onClearProblemUploads() {
    if (clearableCount === 0 || clearing) return
    const confirmed = window.confirm(
      `Remove ${clearableCount} upload${clearableCount === 1 ? "" : "s"} that never completed successfully? This includes rows in Queued, Parsing, Generating, or Error. Rows marked Ready are kept. Storage files for those uploads are deleted too.`
    )
    if (!confirmed) return
    setClearing(true)
    setClearMessage(null)
    try {
      const res = await clearProblemUploads()
      if (!res.ok) {
        setClearMessage(res.message)
        return
      }
      if (res.removed === 0) {
        setClearMessage("Nothing matched to clear.")
      }
      router.refresh()
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle>New lecture</CardTitle>
          <CardDescription>
            Drop slides or recordings. Files upload directly to secure storage,
            then processing runs in the background. When status is Ready, use{" "}
            <Link
              href="/dashboard/review"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Review
            </Link>{" "}
            to study generated flashcards.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-2 max-w-md">
            <Label htmlFor="subject">Subject (optional)</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Pharmacology"
              autoComplete="off"
            />
          </div>

          <div
            role="button"
            tabIndex={0}
            aria-label="Upload files: drag and drop here, or click to choose"
            onDragEnter={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragActive(false)
              }
            }}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            className={cn(
              "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-10 text-center transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/30 hover:bg-muted/50"
            )}
          >
            <div className="flex size-12 items-center justify-center bg-background shadow-sm ring-1 ring-border">
              <Upload className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div>
              <p className="font-heading text-sm font-semibold tracking-wide uppercase">
                Drag & drop files
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, PPTX, or audio/video — up to 50 MB slides / 500 MB media
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-none"
              tabIndex={-1}
              aria-hidden
            >
              <FileUp className="size-3.5" aria-hidden />
              Choose files
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.pptx,.ppt,.mp4,.mov,.mp3,.m4a,.wav"
            multiple
            onChange={onFileChange}
          />
        </CardContent>
      </Card>

      <section aria-labelledby="uploads-heading">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="uploads-heading"
            className="font-heading text-lg font-semibold tracking-wide uppercase"
          >
            Your uploads
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={clearableCount === 0 || clearing}
            onClick={() => void onClearProblemUploads()}
            className="shrink-0 self-start sm:self-auto"
          >
            {clearing
              ? "Clearing…"
              : `Clear failed & stuck${clearableCount > 0 ? ` (${clearableCount})` : ""}`}
          </Button>
        </div>
        {clearMessage ? (
          <p
            role="alert"
            className="mb-3 text-sm text-destructive"
          >
            {clearMessage}
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {optimistic
            .filter((o) => !o.uploadId || !uploads.some((u) => u.id === o.uploadId))
            .map((o) => (
              <li
                key={o.tempKey}
                className="flex flex-col gap-2 border border-border bg-card px-4 py-3 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.fileName}</span>
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">
                    {o.error
                      ? "Failed"
                      : o.phase === "preparing"
                        ? "Preparing"
                        : o.phase === "uploading"
                          ? "Uploading"
                          : "Starting"}
                  </span>
                </div>
                {o.error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {o.error}
                  </p>
                ) : (
                  <Progress value={o.progress} />
                )}
              </li>
            ))}

          {uploads.map((u) => {
            const overlay = overlayByUploadId.get(u.id)
            return (
              <li
                key={u.id}
                className="flex flex-col gap-2 border border-border bg-card px-4 py-3 text-sm shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{u.file_name}</span>
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">
                    {overlay?.error
                      ? "Failed"
                      : overlay && overlay.phase === "uploading"
                        ? `Uploading ${overlay.progress}%`
                        : overlay && overlay.phase === "enqueueing"
                          ? "Starting"
                          : formatStatus(u.status)}
                  </span>
                </div>
                {overlay?.error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {overlay.error}
                  </p>
                ) : null}
                {overlay &&
                !overlay.error &&
                (overlay.phase === "uploading" ||
                  overlay.phase === "enqueueing") ? (
                  <Progress value={overlay.progress} />
                ) : null}
                {u.subject ? (
                  <p className="text-xs text-muted-foreground">{u.subject}</p>
                ) : null}
                {u.status === "error" && u.error_message ? (
                  <p role="alert" className="text-xs text-destructive">
                    {u.error_message}
                  </p>
                ) : null}
                {u.status === "done" ? (
                  <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2">
                    <p className="text-xs text-muted-foreground">
                      {u.chunk_count} excerpt{u.chunk_count === 1 ? "" : "s"} ·{" "}
                      {u.card_count} flashcard{u.card_count === 1 ? "" : "s"}
                    </p>
                    <Button variant="secondary" size="sm" asChild>
                      <Link href="/dashboard/review">Study flashcards</Link>
                    </Button>
                  </div>
                ) : null}
              </li>
            )
          })}

          {uploads.length === 0 &&
            optimistic.filter(
              (o) => !o.uploadId || !uploads.some((u) => u.id === o.uploadId)
            ).length === 0 ? (
              <li className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                No uploads yet. Add a lecture to get started.
              </li>
            ) : null}
        </ul>
      </section>
    </div>
  )
}
