import { createServerSupabaseClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 50

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rawLimit = searchParams.get("limit")
  let limit = DEFAULT_LIMIT
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      return NextResponse.json({ error: "Invalid limit" }, { status: 400 })
    }
    limit = Math.min(parsed, MAX_LIMIT)
  }

  const today = new Date().toISOString().split("T")[0]

  const { data: cards, error } = await supabase
    .from("cards")
    .select("id, question, answer, tags, difficulty, easiness, interval")
    .eq("user_id", user.id)
    .lte("next_review", today)
    .order("difficulty", { ascending: false })
    .limit(limit)

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "Failed to load cards" }, { status: 500 })
  }

  return NextResponse.json({ cards: cards ?? [] })
}
