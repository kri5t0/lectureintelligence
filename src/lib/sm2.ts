export interface CardState {
  easiness: number
  interval: number
  repetitions: number
}

export interface SM2Result extends CardState {
  nextReview: string
}

/**
 * Compute the next SM-2 state after a review.
 *
 * @param state - current card state
 * @param quality - 0 (blackout) to 5 (perfect recall)
 */
export function sm2Update(state: CardState, quality: number): SM2Result {
  if (quality < 0 || quality > 5) {
    throw new Error(`quality must be 0–5, received ${quality}`)
  }

  let { easiness, interval, repetitions } = state

  if (quality < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.round(interval * easiness)
    repetitions += 1
  }

  easiness = Math.max(
    1.3,
    easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  )

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + interval)

  return {
    easiness: Math.round(easiness * 1000) / 1000,
    interval,
    repetitions,
    nextReview: nextReview.toISOString().split("T")[0],
  }
}
