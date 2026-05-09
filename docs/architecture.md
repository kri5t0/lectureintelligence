# Architecture

## Overview

The Lecture Intelligence Platform ingests any combination of lecture slides (PDF or PPTX), audio/video recordings, reading lists and syllabi — and transforms them into a personalised, adaptive revision suite for each student.

The core insight is that generic AI tutors target secondary school. University content is bespoke, dense and module-specific. This platform builds a compounding data moat because every upload trains the personalisation layer on real student behaviour for real courses.

> **The moat in one sentence:** After 12 months at a single university, you hold question banks for specific modules, calibrated difficulty models per subject, and data on which topics each cohort consistently misunderstands. No new entrant can replicate that overnight.

---

## System Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                         INPUTS                          │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Lecture slides│  │ Audio/video  │  │ Reading list │  │
│  │ PDF / PPTX   │  │ MP4 / MP3    │  │ URLs / PDFs  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          └─────────────────▼─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │        AI PROCESSING PIPELINE      │
          │                                    │
          │  ┌───────────┐  ┌──────────────┐  │
          │  │  Content  │→ │      AI      │  │
          │  │  Parsing  │  │Transformation│  │
          │  │           │  │              │  │
          │  │ OCR       │  │ Concept extr.│  │
          │  │ Transcribe│  │ Q-generation │  │
          │  │ Chunking  │  │ Summarisation│  │
          │  └───────────┘  └──────┬───────┘  │
          │                        │          │
          │              ┌─────────▼────────┐ │
          │              │ Personalisation   │ │
          │              │ Per-student model │ │
          │              │ SM-2 scheduling   │ │
          │              └─────────┬────────┘ │
          └────────────────────────┼──────────┘
                                   │
          ┌────────────────────────▼──────────────────────┐
          │                    OUTPUTS                     │
          │                                               │
          │  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
          │  │Flashcards│  │ Practice │  │  Study   │    │
          │  │  (Anki)  │  │  Exams   │  │ Schedule │    │
          │  └──────────┘  └──────────┘  └──────────┘    │
          │                ┌──────────┐                   │
          │                │ Concept  │                   │
          │                │   Map    │                   │
          │                └──────────┘                   │
          └───────────────────────────────────────────────┘
```

---

## Service Architecture

The platform is split into two runtime environments to keep concerns clean and costs low.

### Frontend (Next.js on Vercel)
- Serves the student-facing web application
- Handles file uploads directly to Supabase Storage via signed URLs
- Calls Next.js API routes for all business logic
- Renders flashcard review, exam interface, study schedule, and concept maps

### Processing Microservice (Python FastAPI on Railway)
- Receives processing jobs via HTTP from Next.js API routes
- Runs PyMuPDF, python-pptx, and Whisper transcription
- Calls the Anthropic Claude API for all AI transformation
- Writes chunks and generated cards back to Supabase
- Stateless — horizontally scalable from day one

### Supabase (PostgreSQL + Storage + Auth)
- Row-Level Security means users can only see their own data
- File storage for raw uploads (PDFs, PPTXs, audio)
- Real-time subscriptions to push processing status updates to the frontend
- Manages auth (email/password + magic link)

```
Browser ──upload──▶ Supabase Storage
       ──POST /api/process──▶ Next.js API Route
                                    │
                                    └──POST /process──▶ Python FastAPI
                                                              │
                                           ┌──────────────────┤
                                           │                  │
                                    Supabase DB        Anthropic API
                                    (write chunks,     (Claude Sonnet 4)
                                     write cards)
```

---

## Tech Stack

| Layer | Technology | Purpose | Notes |
|---|---|---|---|
| Frontend | Next.js 14 + TypeScript | Web app & API routes | App Router + Server Actions |
| Auth + DB | Supabase | Users, uploads, progress | Row-level security built in |
| File storage | Supabase Storage | PDFs, PPTXs, audio | Signed URLs for direct upload |
| PDF parsing | PyMuPDF (`fitz`) | Text + layout extraction | Fastest Python PDF library |
| PPTX parsing | python-pptx | Slides, speaker notes | Preserves slide structure |
| Audio/video | OpenAI Whisper API | Transcription | Via Python microservice |
| AI core | Claude Sonnet 4 API | Q-gen, flashcards, maps | Best for academic content |
| Spaced rep. | SM-2 algorithm | Study scheduling | Open source, well-tested |
| Payments | Stripe | Subscriptions | Webhooks for plan updates |
| Deployment | Vercel + Railway | Frontend / Python API | Zero DevOps to start |
| Flashcard export | genanki (Python) | Anki `.apkg` generation | Students can export to Anki |
| Analytics | PostHog | Product analytics | Track upload→card conversion |

---

## Environment Variables

```bash
# .env.local (Next.js)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PYTHON_SERVICE_URL=https://your-railway-service.railway.app
INTERNAL_API_KEY=your-internal-secret
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# .env (Python FastAPI)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...         # for Whisper transcription
INTERNAL_API_KEY=your-internal-secret
```

---

## Directory Structure

```
lecture-intelligence/
├── app/                        # Next.js App Router
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── dashboard/
│   │   ├── page.tsx            # upload list + due cards today
│   │   ├── review/page.tsx     # flashcard review interface
│   │   └── exams/page.tsx      # practice exam interface
│   └── api/
│       ├── process/route.ts    # trigger processing job
│       ├── cards/route.ts      # CRUD for card SM-2 state
│       └── stripe/webhook/route.ts
├── components/
│   ├── FileUploader.tsx
│   ├── FlashcardReview.tsx
│   ├── ExamInterface.tsx
│   └── ConceptMap.tsx          # D3.js concept map renderer
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── stripe.ts
├── python/                     # FastAPI microservice
│   ├── main.py
│   ├── parsers/
│   │   ├── pdf_parser.py
│   │   ├── pptx_parser.py
│   │   └── audio_parser.py
│   ├── ai/
│   │   ├── flashcards.py
│   │   ├── exam_questions.py
│   │   └── concept_map.py
│   └── requirements.txt
└── docs/                       # ← you are here
    ├── architecture.md
    ├── parsing-pipeline.md
    ├── ai-pipeline.md
    ├── database-schema.md
    ├── product-requirements.md
    ├── sm2-algorithm.md
    ├── prompting-guide.md
    └── go-to-market.md
```
