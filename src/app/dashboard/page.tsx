import Link from "next/link"
import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { DashboardUploads } from "@/components/uploads/dashboard-uploads"
import type { UploadRow } from "@/types/uploads"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/sign-in?redirect=/dashboard")
  }

  const { data, error } = await supabase
    .from("uploads")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error(error)
  }

  const uploads = (data ?? []) as UploadRow[]

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
              <Link href="/dashboard/review">Review</Link>
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
            Dashboard
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Upload lecture materials. Processing starts automatically after each
            file lands in storage. When a row shows Ready, open{" "}
            <Link
              href="/dashboard/review"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Review
            </Link>{" "}
            to study flashcards that are due.
          </p>
        </div>
        <DashboardUploads userId={user.id} initialUploads={uploads} />
      </main>
    </div>
  )
}
