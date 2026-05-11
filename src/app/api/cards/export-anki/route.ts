import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { createServerSupabaseClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const execFileAsync = promisify(execFile)
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ExportCard = {
  question: string
  answer: string
  tags: string[]
}

type PythonCandidate = {
  command: string
  prefixArgs: string[]
}

type ExporterAttempt = {
  candidate: PythonCandidate
  error: unknown
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
}

function sanitizeFilenamePart(value: string) {
  const cleaned = value
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return cleaned || "flashcards"
}

async function findExporterScript() {
  const candidates = [
    path.join(process.cwd(), "python", "ai", "export_anki.py"),
    path.join(process.cwd(), "my-app", "python", "ai", "export_anki.py"),
  ]

  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next likely project root.
    }
  }

  throw new Error("Could not locate python/ai/export_anki.py")
}

function formatExecError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error)
  }

  const details = error as Error & {
    code?: unknown
    stderr?: unknown
  }
  const parts = [error.message]

  if (details.code != null) {
    parts.push(`code=${String(details.code)}`)
  }

  if (typeof details.stderr === "string" && details.stderr.trim()) {
    parts.push(details.stderr.trim())
  }

  return parts.join(" | ")
}

function formatAttempt(attempt: ExporterAttempt) {
  const command = [attempt.candidate.command, ...attempt.candidate.prefixArgs].join(" ")
  return `${command}: ${formatExecError(attempt.error)}`
}

async function runExporter({
  scriptPath,
  cardsPath,
  deckName,
  cwd,
}: {
  scriptPath: string
  cardsPath: string
  deckName: string
  cwd: string
}) {
  const candidates: PythonCandidate[] = []
  const configuredPython = process.env.ANKI_EXPORT_PYTHON?.trim()

  if (configuredPython) {
    candidates.push({ command: configuredPython, prefixArgs: [] })
  }

  candidates.push(
    ...(process.platform === "win32"
      ? [
          { command: "py", prefixArgs: ["-3.13"] },
          {
            command: path.join(process.env.SystemRoot ?? "C:\\Windows", "py.exe"),
            prefixArgs: ["-3.13"],
          },
          { command: "python", prefixArgs: [] },
        ]
      : [
          { command: "python3", prefixArgs: [] },
          { command: "python", prefixArgs: [] },
        ]),
  )

  const attempts: ExporterAttempt[] = []
  const tried = new Set<string>()

  for (const candidate of candidates) {
    const key = `${candidate.command}\0${candidate.prefixArgs.join("\0")}`
    if (tried.has(key)) continue
    tried.add(key)

    try {
      await execFileAsync(
        candidate.command,
        [...candidate.prefixArgs, scriptPath, cardsPath, "--deck-name", deckName],
        {
          cwd,
          windowsHide: true,
          timeout: 60_000,
          maxBuffer: 1024 * 1024,
        },
      )
      return
    } catch (error) {
      attempts.push({ candidate, error })
    }
  }

  throw new Error(
    `Anki export failed. Tried Python launchers: ${attempts
      .map(formatAttempt)
      .join(" || ")}`,
  )
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const uploadId = searchParams.get("uploadId")?.trim() || null

  if (uploadId && !UUID_RE.test(uploadId)) {
    return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 })
  }

  let deckName = "Lecture Intelligence Flashcards"
  let filename = "lecture-intelligence-flashcards.apkg"

  if (uploadId) {
    const { data: upload, error: uploadError } = await supabase
      .from("uploads")
      .select("file_name, subject")
      .eq("id", uploadId)
      .eq("user_id", user.id)
      .single()

    if (uploadError || !upload) {
      return NextResponse.json({ error: "Upload not found" }, { status: 404 })
    }

    const name = upload.subject || upload.file_name || "Lecture Intelligence Flashcards"
    deckName = `Lecture Intelligence - ${name}`
    filename = `${sanitizeFilenamePart(name)}.apkg`
  }

  let query = supabase
    .from("cards")
    .select("question, answer, tags, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(5000)

  if (uploadId) {
    query = query.eq("upload_id", uploadId)
  }

  const { data, error } = await query

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "Failed to load cards" }, { status: 500 })
  }

  const cards: ExportCard[] = (data ?? []).map((card) => ({
    question: String(card.question ?? ""),
    answer: String(card.answer ?? ""),
    tags: normalizeTags(card.tags),
  }))

  if (cards.length === 0) {
    return NextResponse.json({ error: "No flashcards to export" }, { status: 404 })
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), `anki-export-${randomUUID()}-`))

  try {
    const scriptPath = await findExporterScript()
    const cardsPath = path.join(tempDir, "cards.json")
    const outputPath = path.join(tempDir, "test_deck.apkg")

    await writeFile(cardsPath, JSON.stringify(cards), "utf-8")
    await runExporter({ scriptPath, cardsPath, deckName, cwd: tempDir })

    const deck = await readFile(outputPath)

    return new Response(deck, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { error: "Failed to generate Anki deck" },
      { status: 500 },
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
