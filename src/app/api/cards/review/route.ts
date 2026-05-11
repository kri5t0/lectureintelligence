import { sm2Update } from "@/lib/sm2"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("cardId" in body) ||
    !("quality" in body)
  ) {
    return NextResponse.json(
      { error: "Expected cardId and quality" },
      { status: 400 },
    )
  }

  const { cardId, quality } = body as { cardId: unknown; quality: unknown }

  if (typeof cardId !== "string" || cardId.length === 0) {
    return NextResponse.json({ error: "Invalid cardId" }, { status: 400 })
  }

  if (
    typeof quality !== "number" ||
    !Number.isInteger(quality) ||
    quality < 0 ||
    quality > 5
  ) {
    return NextResponse.json(
      { error: "quality must be an integer from 0 to 5" },
      { status: 400 },
    )
  }

  const { data: card, error: fetchError } = await supabase
    .from("cards")
    .select("easiness, interval, repetitions")
    .eq("id", cardId)
    .eq("user_id", user.id)
    .single()

  if (fetchError || !card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let updated
  try {
    updated = sm2Update(
      {
        easiness: card.easiness,
        interval: card.interval,
        repetitions: card.repetitions,
      },
      quality,
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid review"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from("cards")
    .update({
      easiness: updated.easiness,
      interval: updated.interval,
      repetitions: updated.repetitions,
      next_review: updated.nextReview,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cardId)
    .eq("user_id", user.id)

  if (updateError) {
    console.error(updateError)
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 })
  }

  const { error: sessionError } = await supabase.from("review_sessions").insert({
    card_id: cardId,
    user_id: user.id,
    quality,
  })

  if (sessionError) {
    console.error(sessionError)
    return NextResponse.json(
      { error: "Failed to record review session" },
      { status: 500 },
    )
  }

  return NextResponse.json({
    interval: updated.interval,
    next_review: updated.nextReview,
    easiness: updated.easiness,
    repetitions: updated.repetitions,
  })
}
