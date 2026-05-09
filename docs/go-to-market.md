# Go-to-Market & Monetisation

## Strategic Principle

The single most common EdTech mistake is pitching to universities first. Procurement cycles take 12–18 months and kill early-stage momentum. The correct sequence is:

1. **Get students using it directly** (B2C organic)
2. **Prove retention and love** (metrics and testimonials)
3. **Use that proof to close B2B contracts** (university site licences)

The B2C phase is not just a stepping stone — it is the moat-building phase. Every student who uploads a lecture file, reviews their cards, and returns the next day is generating data that makes the platform better for the next student in that module.

---

## Phase 1: Getting Your First 100 Users (Weeks 7–12)

### Channel 1 — Reddit (fastest, free)

Target degree-specific subreddits where students are already in "revision mode". Do not post advertisements. Post genuinely useful content and let the product speak for itself.

**Recommended subreddits by subject:**

| Subject | Subreddit |
|---|---|
| Medicine (UK) | r/medicalschool, r/ukmedicaleducation |
| Law (UK) | r/LawSchoolUK, r/uklaw |
| General UK students | r/UniUK, r/6thForm |
| Pharmacy | r/PharmacyStudents |
| Psychology | r/psychologystudents |
| Nursing | r/StudentNurse |

**Post format that works:**

> "I built a tool that turns your lecture slides into flashcards and practice questions. Here's what it did with 60 slides of pharmacology: [screenshot of output]. Free to try — no account needed for the first 3 uploads."

A screenshot of a real, high-quality output is your entire marketing asset. If your flashcards are good, the post does the work.

**What to avoid:**
- "Check out my startup" framing
- Vague benefits ("helps you study better")
- Asking for feedback on your business model

**Expected result:** One well-timed post in r/medicalschool or r/UniUK during a revision period (April, November/December) can generate 100–300 signups in 48 hours.

---

### Channel 2 — Student Note-Sharing Accounts

Instagram and TikTok accounts that share lecture notes for specific degree programmes often have 10k–50k followers. These audiences are highly targeted and already in the product's core use case.

**Finding them:**
- Search Instagram: `#mednotesuk`, `#lawnotesuk`, `#pharmacynotes`
- Search TikTok: `"lecture notes"`, `"revision tips uk"`
- Look for accounts with 5k–100k followers that post consistently

**Offer:**
6 months of the Student plan free (£42 value) in exchange for one honest post showing their followers how the tool works. No payment, no script — just ask them to try it genuinely and share their honest experience.

**Why this works:** These audiences trust the account they follow. A lukewarm genuine recommendation outperforms a polished ad. If your product is good, the post will convert.

**Expected result:** 50–200 signups per post from a well-matched account.

---

### Channel 3 — Student Unions

Most UK universities have an Academic Affairs Officer or Education Officer on the Students' Union exec. This person is actively looking for tools to recommend to students — it's literally their job.

**How to reach them:**
1. Find the SU website for a target university
2. Email the Academic Affairs Officer directly (not a contact form)
3. Offer a 15-minute Zoom demo and 3 months free for their student body

Subject line: `"Free AI revision tool for [University] students — quick demo?"`

**What to show in the demo:**
- Live upload of a lecture PDF from their institution (if available online)
- The flashcards generated in real time
- The practice exam with mark schemes
- The "due today" dashboard

**Expected result:** An SU newsletter mention reaches 10k–30k students. Even 0.1% conversion is 10–30 new users.

---

### Channel 4 — Referral Programme

Once you have 50+ active users, activate a referral scheme.

**Mechanics:**
- Each paying subscriber gets a unique referral link
- When a referred user signs up and upgrades to paid: the referrer gets **1 month free**
- No cap on free months earned

**Why one month (not cash):** Accounting is simpler, it costs you only the marginal AI cost of an extra month (~£2.60), and it incentivises referrers who are already getting value.

**Implementation:**
1. Generate a unique code per user on signup and store in Supabase
2. Track referral attribution with a `referrer_id` column on the `users` table
3. Stripe handles the credit via `customer.balance` API

---

## Phase 2: First B2B Contract (Months 6–12)

Once you have 500+ active users at a single university, you have enough leverage to approach the institution.

### Who to approach

**Primary:** Learning & Teaching Enhancement team (or equivalent). They hold the budget for academic technology tools and report to the Deputy Vice-Chancellor (Education).

**Secondary:** The Careers & Employability team is increasingly interested in revision tools that help students achieve better degree classifications.

**Avoid:** IT procurement teams as a first contact. They are gatekeepers, not buyers.

### What to bring

1. **Usage data:** Number of uploads from students at their institution, average session length, D30 retention
2. **Student testimonials:** 3–5 quotes from students at that university
3. **Outcome data:** If you can show a correlation between platform usage and self-reported exam performance (even a survey), this is powerful

### Pricing

| Scope | Price |
|---|---|
| Single department (e.g. Medical School, ~500 students) | £1,500–£3,000/year |
| Faculty (e.g. Faculty of Science, ~3,000 students) | £8,000–£15,000/year |
| Whole institution (10,000+ students) | £25,000–£60,000/year |

Use a price-per-enrolled-student model (£3–£5/student/year) when scoping larger deals. This scales the conversation naturally: "How many students are in the faculty you'd want to cover?"

### What a university contract unlocks

- **SSO integration:** Students log in with their university credentials (no separate account)
- **Admin dashboard:** Module leaders can see aggregated (anonymised) performance data for their cohort
- **Module-level content:** Lecturers can officially upload their own slides, making the content library authoritative
- **LMS integration:** Surfacing due cards inside their existing Moodle/Canvas/Blackboard instance

Build these features only when you have the contract signed. Do not build them speculatively.

---

## Monetisation Model

### Pricing Tiers

| Tier | Price | Upload limit | Key features |
|---|---|---|---|
| **Free** | £0/mo | 3 lifetime | Flashcards only · 50-card cap |
| **Student** | £6.99/mo | Unlimited | Flashcards + exams + schedule + Anki export |
| **Study Group** | £12.99/mo | Unlimited | Up to 5 students · shared decks |
| **University** | Custom | Unlimited (site) | SSO · admin dashboard · module analytics |

### Conversion mechanics

The free tier's 50-card cap is hit during a single revision session on a 40-slide lecture. This is intentional: it gives users enough value to become believers, but creates an immediate, natural paywall exactly when they want to go deeper.

**Target conversion rate:** 4–6% of free users upgrade within 30 days of signup.

### Unit economics (Student tier)

| Item | Monthly |
|---|---|
| Revenue per subscriber | £6.99 |
| Anthropic API cost (est. 20 uploads/mo) | £2.60 |
| Supabase / hosting cost | £0.40 |
| Stripe fee (1.5% + 20p) | £0.30 |
| **Net margin per subscriber** | **~£3.70 (~53%)** |

At 500 paying subscribers: ~£1,850/month gross margin. At 2,000 subscribers: ~£7,400/month — comfortably profitable before any B2B revenue.

---

## The Moat

The four assets that compound with time and usage and cannot be replicated by a better-funded competitor launching later:

### 1. Module-specific question banks

After 100 students from the same module upload their slides, you have a curated question bank that reflects exactly what that lecturer tests. These questions are calibrated against real exam performance data. A competitor with better AI but no data cannot replicate this.

### 2. Difficulty calibration per course

Your SM-2 data shows which questions students consistently get wrong. After 12 months, the `difficulty` labels on your cards are ground-truthed against real student performance, not AI estimates. Cards that a whole cohort struggles with get surfaced more aggressively for the next cohort.

### 3. Lecturer content library

When a lecturer officially uploads their own slides through a university contract, you have first-party content. This is categorically more valuable than student-uploaded slides: it is authoritative, complete, and covers exactly what will be in the exam.

### 4. Network effects within cohorts

When five students from the same tutorial group all use the platform, their collective performance data makes the personalisation engine better for all of them. If four of them struggle with the same concept, the fifth student gets that concept scheduled for extra review before they would have reached it naturally. This is a real network effect that competitors cannot short-circuit.

---

## Key Metrics to Track from Day 1

| Metric | Tool | Why it matters |
|---|---|---|
| Upload-to-card conversion rate | PostHog | Are files being processed successfully? |
| D1 / D7 / D30 retention | PostHog | Are students coming back? |
| Cards reviewed per session | PostHog | Is the review loop working? |
| Free → paid conversion rate | Stripe + PostHog | Core business health |
| Average uploads per paying user | Supabase | Product stickiness |
| NPS score | Typeform (monthly survey) | Overall satisfaction |
| Processing error rate | Sentry | Infrastructure reliability |
