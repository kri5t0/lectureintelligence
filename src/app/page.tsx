import Link from "next/link"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"

export default async function Home() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/30 p-6">
      <div className="max-w-md text-center">
        <h1 className="font-heading text-3xl font-semibold tracking-wide uppercase sm:text-4xl">
          Lecture Intelligence
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Turn lectures into flashcards, practice exams, and structured review —
          built for university-level courses.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {user ? (
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        ) : (
          <>
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
