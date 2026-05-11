"use client"

import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
} from "react"
import Link from "next/link"
import katex from "katex"
import "katex/dist/katex.min.css"

import { cn } from "@/lib/utils"

export interface DueCard {
  id: string
  question: string
  answer: string
  tags: string[]
  difficulty: number
  easiness: number
  interval: number
}

const QUALITY_LABELS: Record<number, string> = {
  0: "Blackout",
  1: "Wrong, familiar",
  2: "Wrong, easy answer",
  3: "Hard",
  4: "Good",
  5: "Easy",
}

const MATH_DELIMITERS = [
  { open: "\\[", close: "\\]", displayMode: true },
  { open: "\\(", close: "\\)", displayMode: false },
  { open: "$", close: "$", displayMode: false },
] as const

function isEscaped(text: string, index: number) {
  let slashCount = 0
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function findToken(text: string, token: string, from: number, skipEscaped: boolean) {
  let index = text.indexOf(token, from)
  while (index !== -1) {
    if (!skipEscaped || !isEscaped(text, index)) return index
    index = text.indexOf(token, index + token.length)
  }
  return -1
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function findNextMathSegment(text: string, from: number) {
  let searchFrom = from

  while (searchFrom < text.length) {
    let next:
      | {
          start: number
          open: string
          close: string
          displayMode: boolean
        }
      | null = null

    for (const delimiter of MATH_DELIMITERS) {
      const start = findToken(text, delimiter.open, searchFrom, delimiter.open === "$")
      if (start !== -1 && (!next || start < next.start)) {
        next = { start, ...delimiter }
      }
    }

    if (!next) return null

    const contentStart = next.start + next.open.length
    const end = findToken(text, next.close, contentStart, next.close === "$")

    if (end !== -1) {
      return {
        start: next.start,
        end: end + next.close.length,
        expression: text.slice(contentStart, end),
        displayMode: next.displayMode,
      }
    }

    searchFrom = contentStart
  }

  return null
}

function renderMathText(text: string) {
  const html: string[] = []
  let index = 0
  let segment = findNextMathSegment(text, index)

  while (segment) {
    html.push(escapeHtml(text.slice(index, segment.start)))

    try {
      html.push(
        katex.renderToString(segment.expression, {
          displayMode: segment.displayMode,
          throwOnError: true,
        }),
      )
    } catch {
      html.push(escapeHtml(text.slice(segment.start, segment.end)))
    }

    index = segment.end
    segment = findNextMathSegment(text, index)
  }

  html.push(escapeHtml(text.slice(index)))
  return html.join("")
}

function MathText({ className, text }: { className?: string; text: string }) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMathText(text) }}
    />
  )
}

export function FlashcardReview() {
  const [cards, setCards] = useState<DueCard[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadDue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/cards/due", { credentials: "same-origin" })
      const data = (await res.json()) as { cards?: DueCard[]; error?: string }

      if (!res.ok) {
        setError(data.error ?? "Could not load due cards")
        setCards([])
        return
      }

      setCards(data.cards ?? [])
      setIndex(0)
      setFlipped(false)
    } catch {
      setError("Could not load due cards")
      setCards([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDue()
  }, [loadDue])

  const current = cards[index]
  const total = cards.length
  const position = total === 0 ? 0 : index + 1

  const submitQuality = async (quality: number) => {
    if (!current || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/cards/review", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: current.id, quality }),
      })

      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        setError(data.error ?? "Review failed")
        setSubmitting(false)
        return
      }

      setCards((prev) => {
        const next = prev.filter((c) => c.id !== current.id)
        const removedIdx = prev.findIndex((c) => c.id === current.id)
        const nextIndex =
          next.length === 0
            ? 0
            : Math.min(removedIdx === -1 ? 0 : removedIdx, next.length - 1)
        setIndex(nextIndex)
        return next
      })
      setFlipped(false)
    } catch {
      setError("Review failed")
    } finally {
      setSubmitting(false)
    }
  }

  const toggleFlip = () => {
    if (!current || submitting) return
    setFlipped((f) => !f)
  }

  const onKeyFlip = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      toggleFlip()
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm"
        role="status"
        aria-live="polite"
      >
        Loading cards due today…
      </div>
    )
  }

  if (error && cards.length === 0 && !loading) {
    return (
      <div className="space-y-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={() => void loadDue()}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <p className="text-lg font-medium text-foreground">You&apos;re all caught up</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No flashcards are due for review right now. New cards from a finished
          upload usually appear here the same calendar day (UTC); try Refresh
          after processing completes.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void loadDue()}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-muted"
          >
            Refresh
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-border bg-muted/50 px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-muted"
          >
            Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Card {position} of {total}
        </span>
        {current.tags.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {current.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <div className="perspective-[1200px]">
        <button
          type="button"
          className={cn(
            "relative min-h-[220px] w-full cursor-pointer rounded-2xl border border-border bg-transparent p-0 text-left shadow-sm outline-none transition-transform duration-500 [transform-style:preserve-3d]",
            flipped && "[transform:rotateY(180deg)]",
          )}
          onClick={toggleFlip}
          onKeyDown={onKeyFlip}
          aria-label={flipped ? "Show question" : "Show answer"}
          disabled={submitting}
        >
          <span className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-card p-6 [backface-visibility:hidden]">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question
            </span>
            <MathText
              className="mt-3 flex-1 text-base leading-relaxed text-foreground"
              text={current.question}
            />
            <span className="mt-4 text-xs text-muted-foreground">
              Click or press Enter to reveal the answer
            </span>
          </span>

          <span className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-muted/40 p-6 [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Answer
            </span>
            <MathText
              className="mt-3 flex-1 text-base leading-relaxed text-foreground"
              text={current.answer}
            />
            <span className="mt-4 text-xs text-muted-foreground">
              Click to flip back to the question
            </span>
          </span>
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          How well did you recall?
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {([0, 1, 2, 3, 4, 5] as const).map((q) => (
            <button
              key={q}
              type="button"
              disabled={!flipped || submitting}
              title={QUALITY_LABELS[q]}
              onClick={() => void submitQuality(q)}
              className={cn(
                "rounded-xl border border-border bg-background px-2 py-3 text-center text-sm font-medium shadow-sm transition",
                "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <span className="block text-lg font-semibold tabular-nums">{q}</span>
              <span className="mt-1 block text-[11px] leading-tight text-muted-foreground">
                {QUALITY_LABELS[q]}
              </span>
            </button>
          ))}
        </div>
        {!flipped ? (
          <p className="text-center text-xs text-muted-foreground">
            Reveal the answer to rate your recall (0–5).
          </p>
        ) : null}
      </div>
    </div>
  )
}
