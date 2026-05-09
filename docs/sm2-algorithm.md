# SM-2 Algorithm

SM-2 (SuperMemo 2) is the spaced repetition algorithm that powers Anki. It calculates the optimal number of days to wait before reviewing a flashcard again, based on how well the student recalled it.

This document covers the algorithm, the Python implementation used by the backend, and the TypeScript implementation used in Next.js API routes.

---

## How SM-2 Works

Each card has three pieces of state:

| Variable | Meaning | Initial value |
|---|---|---|
| `easiness` (EF) | How easy this card is for this student | 2.5 |
| `interval` | Days until next review | 1 |
| `repetitions` | How many times reviewed successfully in a row | 0 |

After each review, the student rates their recall from 0 to 5:

| Quality | Meaning |
|---|---|
| 0 | Complete blackout — no memory at all |
| 1 | Wrong answer, but it was familiar when revealed |
| 2 | Wrong answer, but the correct answer seemed easy |
| 3 | Correct, but required significant effort |
| 4 | Correct with minor hesitation |
| 5 | Perfect recall, no hesitation |

---

## The Algorithm

```
If quality < 3 (incorrect recall):
    reset repetitions → 0
    reset interval    → 1

If quality ≥ 3 (correct recall):
    if repetitions == 0:  interval → 1
    if repetitions == 1:  interval → 6
    if repetitions >= 2:  interval → round(interval × easiness)
    repetitions += 1

Always:
    easiness = max(1.3, easiness + 0.1 - (5 - quality) × (0.08 + (5 - quality) × 0.02))
    next_review = today + interval days
```

The easiness formula ensures cards answered poorly have their EF reduced (making them appear more frequently) while cards answered easily have their EF increased (spacing them further apart).

---

## Python Implementation (Backend)

```python
# python/sm2.py
from dataclasses import dataclass, field
from datetime import date, timedelta

@dataclass
class CardState:
    card_id:     str
    easiness:    float = 2.5
    interval:    int   = 1
    repetitions: int   = 0
    next_review: date  = field(default_factory=date.today)

def sm2_update(state: CardState, quality: int) -> CardState:
    """
    Update a card's SM-2 state after a review.

    Args:
        state:   current CardState
        quality: student's recall quality, 0–5

    Returns:
        updated CardState (mutated in place and returned)

    Raises:
        ValueError: if quality is not in range 0–5
    """
    if not 0 <= quality <= 5:
        raise ValueError(f"quality must be 0–5, got {quality}")

    if quality < 3:
        # Incorrect: reset progress
        state.repetitions = 0
        state.interval    = 1
    else:
        # Correct: advance interval
        if state.repetitions == 0:
            state.interval = 1
        elif state.repetitions == 1:
            state.interval = 6
        else:
            state.interval = round(state.interval * state.easiness)
        state.repetitions += 1

    # Update easiness factor (floor at 1.3)
    state.easiness = max(
        1.3,
        state.easiness
        + 0.1
        - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    )

    state.next_review = date.today() + timedelta(days=state.interval)
    return state
```

### Integration with Supabase

```python
from supabase import create_client
import os

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)

def review_card(card_id: str, user_id: str, quality: int) -> dict:
    """Fetch card state, update it via SM-2, persist to DB."""
    # Fetch current state
    row = (
        supabase.table("cards")
        .select("easiness, interval, repetitions")
        .eq("id", card_id)
        .eq("user_id", user_id)
        .single()
        .execute()
        .data
    )

    state = CardState(
        card_id=card_id,
        easiness=row["easiness"],
        interval=row["interval"],
        repetitions=row["repetitions"],
    )

    updated = sm2_update(state, quality)

    # Persist updated state
    supabase.table("cards").update({
        "easiness":    updated.easiness,
        "interval":    updated.interval,
        "repetitions": updated.repetitions,
        "next_review": updated.next_review.isoformat(),
        "updated_at":  "now()",
    }).eq("id", card_id).execute()

    # Log to review_sessions
    supabase.table("review_sessions").insert({
        "card_id": card_id,
        "user_id": user_id,
        "quality": quality,
    }).execute()

    return {
        "interval":    updated.interval,
        "next_review": updated.next_review.isoformat(),
        "easiness":    round(updated.easiness, 2),
    }
```

---

## TypeScript Implementation (Next.js)

Used in the `/api/cards/review` route so the review update stays in the API layer without needing a roundtrip to the Python service.

```typescript
// lib/sm2.ts

export interface CardState {
    easiness:    number   // default 2.5
    interval:    number   // days, default 1
    repetitions: number   // default 0
}

export interface SM2Result extends CardState {
    nextReview: string  // ISO date string "YYYY-MM-DD"
}

/**
 * Compute the next SM-2 state after a review.
 *
 * @param state   - current card state
 * @param quality - 0 (blackout) to 5 (perfect recall)
 */
export function sm2Update(state: CardState, quality: number): SM2Result {
    if (quality < 0 || quality > 5) {
        throw new Error(`quality must be 0–5, received ${quality}`)
    }

    let { easiness, interval, repetitions } = state

    if (quality < 3) {
        // Incorrect response: reset
        repetitions = 0
        interval    = 1
    } else {
        // Correct response: advance
        if (repetitions === 0)      interval = 1
        else if (repetitions === 1) interval = 6
        else                        interval = Math.round(interval * easiness)
        repetitions += 1
    }

    // Update easiness (minimum 1.3)
    easiness = Math.max(
        1.3,
        easiness + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
    )

    const nextReview = new Date()
    nextReview.setDate(nextReview.getDate() + interval)

    return {
        easiness:    Math.round(easiness * 1000) / 1000,  // 3 d.p.
        interval,
        repetitions,
        nextReview:  nextReview.toISOString().split("T")[0],
    }
}
```

---

## Behaviour Reference

The table below shows how interval and easiness evolve for a card always answered with quality 4 (good recall):

| Review # | Quality | Interval (days) | EF |
|---|---|---|---|
| 1 | 4 | 1 | 2.5 |
| 2 | 4 | 6 | 2.5 |
| 3 | 4 | 15 | 2.5 |
| 4 | 4 | 37 | 2.5 |
| 5 | 4 | 92 | 2.5 |

For a card consistently answered with quality 2 (barely recalled):

| Review # | Quality | Interval (days) | EF |
|---|---|---|---|
| 1 | 2 | 1 | 2.18 |
| 2 | 2 | 1 | 1.86 |
| 3 | 2 | 1 | 1.54 |
| 4 | 2 | 1 | 1.30 (floor) |

Cards with a low EF stay in the review queue daily until the student has genuinely mastered them.

---

## Session Logic

A review session shows all cards where `next_review <= today`. Sessions are capped at 50 cards to avoid overwhelming students.

```python
from datetime import date

def get_due_cards(user_id: str, limit: int = 50) -> list[dict]:
    """Fetch cards due for review today, prioritised by difficulty."""
    today = date.today().isoformat()
    result = (
        supabase.table("cards")
        .select("id, question, answer, tags, difficulty, easiness, interval")
        .eq("user_id", user_id)
        .lte("next_review", today)
        .order("difficulty", desc=True)   # hardest cards first
        .limit(limit)
        .execute()
    )
    return result.data
```

### Ordering within a session

1. Cards with `difficulty >= 4` (application/synthesis) first
2. Then cards with `easiness < 2.0` (historically difficult for this student)
3. Then all remaining due cards

This ordering ensures the student tackles the hardest material while they are freshest.

---

## New Card Injection

New cards (never reviewed) are mixed into sessions gradually to avoid overwhelming students with unfamiliar material. A session of 50 cards should contain no more than 10 new cards.

```python
def build_session(user_id: str, session_size: int = 50) -> list[dict]:
    """Build a review session mixing due cards with new cards."""
    new_limit = session_size // 5  # max 20% new cards

    today = date.today().isoformat()

    due = (
        supabase.table("cards")
        .select("*")
        .eq("user_id", user_id)
        .lte("next_review", today)
        .gt("repetitions", 0)       # previously reviewed
        .order("difficulty", desc=True)
        .limit(session_size - new_limit)
        .execute()
        .data
    )

    new_cards = (
        supabase.table("cards")
        .select("*")
        .eq("user_id", user_id)
        .eq("repetitions", 0)       # never reviewed
        .order("difficulty", desc=True)
        .limit(new_limit)
        .execute()
        .data
    )

    return due + new_cards
```

---

## Tests

```python
# python/tests/test_sm2.py
import pytest
from sm2 import CardState, sm2_update
from datetime import date, timedelta

def test_correct_recall_advances_interval():
    state = CardState("card-1")
    state = sm2_update(state, 4)
    assert state.interval == 1
    assert state.repetitions == 1

    state = sm2_update(state, 4)
    assert state.interval == 6
    assert state.repetitions == 2

    state = sm2_update(state, 4)
    assert state.interval == 15  # round(6 * 2.5) = 15
    assert state.repetitions == 3

def test_incorrect_recall_resets():
    state = CardState("card-2")
    sm2_update(state, 4)
    sm2_update(state, 4)
    sm2_update(state, 2)  # incorrect
    assert state.repetitions == 0
    assert state.interval == 1

def test_easiness_floor():
    state = CardState("card-3")
    for _ in range(20):
        sm2_update(state, 0)  # always blackout
    assert state.easiness == 1.3

def test_next_review_set_correctly():
    state = CardState("card-4")
    sm2_update(state, 4)
    expected = date.today() + timedelta(days=1)
    assert state.next_review == expected

def test_invalid_quality_raises():
    state = CardState("card-5")
    with pytest.raises(ValueError):
        sm2_update(state, 6)
```
