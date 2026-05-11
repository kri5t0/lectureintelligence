import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { FlashcardReview } from "@/components/FlashcardReview"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Review",
}

export default async function ReviewPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/sign-in?redirect=/dashboard/review")
  }

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="font-heading text-sm font-semibold tracking-wider uppercase text-foreground"
          >
            Lecture Intelligence
          </Link>
          <div className="flex gap-2">
            <Button variant="default" size="sm" asChild>
              <a href="/api/cards/export-anki">Export Anki</a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-10">
          <h1 className="font-heading text-2xl font-semibold tracking-wide uppercase sm:text-3xl">
            Flashcard review
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Cards due today use spaced repetition (SM-2). Flip to reveal the
            answer, then rate how well you recalled it.
          </p>
        </div>
        <FlashcardReview />
      </main>
    </div>
  )
}
