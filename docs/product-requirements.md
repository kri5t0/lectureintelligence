# Product Requirements

## Vision

A university-specific AI learning platform that transforms any lecture content into personalised revision tools. The core differentiator is institution-specific content: generic AI tutors use textbooks; this platform ingests the exact slides, recordings, and reading lists from a student's own course.

---

## MVP Scope (8 Weeks)

The MVP proves one thing: **a student can upload a lecture file and get back revision materials that are meaningfully better than anything they could create manually in the same time.**

### In scope for MVP

| Feature | Priority | Notes |
|---|---|---|
| File upload (PDF, PPTX) | P0 | Core loop |
| Flashcard generation | P0 | Anki-compatible JSON |
| Flashcard review interface | P0 | SM-2 scheduling |
| Practice exam questions (MCQ + short) | P0 | With mark schemes |
| Stripe subscription | P0 | Free + paid tiers |
| Email/password auth | P0 | Supabase Auth |
| Audio/video transcription | P1 | Via Whisper API |
| Anki `.apkg` export | P1 | Via genanki |
| Concept map output | P1 | D3.js renderer |
| Study summary | P1 | Plain-text overview |
| Essay question generation | P2 | After MCQ/short works well |
| Cohort shared decks | P2 | Requires group infrastructure |
| University SSO | P3 | After B2B contract signed |
| Admin analytics dashboard | P3 | After B2B contract signed |

### Out of scope for MVP

- Native mobile app (Progressive Web App is sufficient to start)
- Live collaboration / shared annotation
- Video player integration (students upload the file; no in-app playback)
- Content moderation pipeline
- Multi-language support

---

## 8-Week Build Plan

### Weeks 1–2: Infrastructure & Parsing

**Goal:** A file uploaded by a student produces a list of chunks in the database.

- [ ] Initialise Next.js 14 project with TypeScript; deploy to Vercel
- [ ] Set up Supabase project: create all tables (see `database-schema.md`), enable RLS
- [ ] Configure Supabase Storage bucket (`uploads`) with per-user path policy
- [ ] Build `FileUploader` component: drag-and-drop, progress bar, file type validation
- [ ] Implement signed URL upload flow (browser → Supabase Storage, no server middleman)
- [ ] Create Python FastAPI microservice on Railway
- [ ] Implement PDF parser (`PyMuPDF`) — see `parsing-pipeline.md`
- [ ] Implement PPTX parser (`python-pptx`) — see `parsing-pipeline.md`
- [ ] Wire `POST /api/process` route: creates upload record, fires job to Python service
- [ ] Test end-to-end: upload a real lecture PDF, verify chunks appear in DB

**Done when:** A 30-slide pharmacology deck produces 80+ clean chunks in the database.

---

### Weeks 3–4: AI Core & Student UI

**Goal:** Chunks become flashcards; students can review them.

- [ ] Implement flashcard generation (see `ai-pipeline.md`)
- [ ] Implement exam question generation with mark schemes
- [ ] Build `/dashboard` page: list of uploads with status indicators
- [ ] Build flashcard review interface (question → reveal → quality rating 1–5)
- [ ] Implement SM-2 state update via `POST /api/cards/review`
- [ ] Build "due today" counter on dashboard
- [ ] Integrate Stripe: create `Free` and `Student` products and prices
- [ ] Build `/api/stripe/webhook` route to handle `checkout.session.completed` and `customer.subscription.deleted`
- [ ] Add upload limit enforcement: free users blocked after 3 uploads

**Done when:** A student can sign up, upload a file, review their flashcards, and pay to unlock unlimited uploads.

---

### Weeks 5–6: Enriched Outputs

**Goal:** The product is substantially more useful than a flashcard generator.

- [ ] Implement Whisper transcription for audio/video uploads
- [ ] Implement concept map generation and D3.js renderer in the browser
- [ ] Implement study summary generation (shown on upload detail page)
- [ ] Build practice exam interface: timed mode, MCQ auto-marking, short-answer self-mark
- [ ] Implement Anki `.apkg` export (genanki)
- [ ] Add upload detail page: summary + all outputs in one view
- [ ] Add PostHog analytics: track `upload_created`, `cards_generated`, `review_completed`, `subscription_started`

**Done when:** Every upload produces a summary, flashcards, concept map, and a practice exam.

---

### Weeks 7–8: Beta & Launch

**Goal:** 30+ active beta users; product is publicly launchable.

- [ ] Recruit beta cohort: 20–30 students from one university, one subject
- [ ] Conduct 5 usability interviews; identify top 3 friction points
- [ ] Fix top 10 issues from beta feedback
- [ ] Add basic onboarding flow (subject selection, sample upload)
- [ ] Set up error monitoring (Sentry on both Next.js and FastAPI)
- [ ] Performance: ensure any PDF under 100 pages processes in < 90 seconds
- [ ] Launch: post in r/UniUK, r/medicalschool (choose based on beta cohort's subject)
- [ ] Set up referral scheme: one free month per paying referral

**Done when:** 10 paying subscribers and 50 active free users in week 8.

---

## Feature Specifications

### File Upload

- **Accepted types:** `.pdf`, `.pptx`, `.ppt`, `.mp4`, `.mov`, `.mp3`, `.m4a`, `.wav`
- **Max size:** 500 MB (audio/video), 50 MB (slides)
- **Upload method:** browser-to-Storage signed URL (bypasses the Next.js server to avoid timeout and bandwidth costs)
- **Post-upload:** show animated "processing" state; poll `uploads.status` every 3 seconds via Supabase real-time

### Flashcard Review Interface

- Cards shown one at a time: question face first
- Student taps/clicks "Reveal" to see the answer
- Rate recall quality: **Again (0)** · **Hard (2)** · **Good (3)** · **Easy (5)**
- Session ends when all due cards are reviewed or student exits
- Show progress bar: "X cards left today"
- Keyboard shortcuts: `Space` to reveal, `1/2/3/4` for quality ratings

### Practice Exam Interface

- Student selects an upload and clicks "Start practice exam"
- Timed mode (configurable, default 45 minutes) or untimed
- MCQ: show 4 options, student selects one, immediate feedback + mark scheme
- Short answer: student types response, then self-marks against the model mark scheme
- Essay: student writes, then sees the band descriptor mark scheme
- End screen: score (MCQ), time taken, link to relevant flashcards

### Study Schedule (Dashboard)

- Prominent "Due today: N cards" at the top of the dashboard
- Calendar heatmap showing review activity (last 30 days)
- Per-upload breakdown: "12 cards due from Pharmacology Week 3"

---

## Non-Functional Requirements

| Requirement | Target |
|---|---|
| Processing time (50-slide PDF) | < 60 seconds |
| Processing time (90-min lecture MP4) | < 5 minutes |
| API uptime | 99.5% |
| Flashcard review latency | < 200ms |
| Data isolation | Enforced at DB level via RLS |
| GDPR | Users can delete their account + all data |

---

## Pricing Tiers

| Tier | Price | Uploads | Features |
|---|---|---|---|
| **Free** | £0/mo | 3 lifetime | Flashcards only · 50 cards max |
| **Student** | £6.99/mo | Unlimited | Flashcards + exams + schedule + Anki export |
| **Study Group** | £12.99/mo | Unlimited | Up to 5 students · shared decks |
| **University** | Custom (£3–5/student/yr) | Unlimited (site) | SSO · admin dashboard · module analytics |

> **Conversion target:** 3–5% of free users upgrade to Student within 30 days of signup. This is achievable because the free tier's 50-card cap is hit quickly during an active revision session.

---

## Success Metrics (Week 8)

| Metric | Target |
|---|---|
| Registered users | 200+ |
| Paying subscribers | 10+ |
| Uploads processed | 100+ |
| D7 retention | 40%+ |
| Average flashcards per upload | 12+ |
| NPS | > 40 |
