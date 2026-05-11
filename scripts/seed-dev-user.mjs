/**
 * Creates a local Supabase Auth user for testing (e.g. flashcard review).
 *
 * Prerequisites in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY  — Dashboard → Settings → API → service_role (secret)
 *
 * Run:
 *   npm run seed:dev-user
 *
 * Default sign-in after seeding:
 *   Email:    dev@lecture-intelligence.test
 *   Password: LocalReviewDev2026!
 *
 * Override with DEV_SEED_EMAIL / DEV_SEED_PASSWORD before running the script.
 */

import { createClient } from "@supabase/supabase-js"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local")
  if (!existsSync(p)) return
  const raw = readFileSync(p, "utf8")
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvLocal()

const DEV_EMAIL = process.env.DEV_SEED_EMAIL ?? "dev@lecture-intelligence.test"
const DEV_PASSWORD = process.env.DEV_SEED_PASSWORD ?? "LocalReviewDev2026!"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Add them to .env.local (service_role key is in Supabase Dashboard → Settings → API).",
  )
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const { error } = await supabase.auth.admin.createUser({
  email: DEV_EMAIL,
  password: DEV_PASSWORD,
  email_confirm: true,
})

if (error) {
  const msg = error.message ?? ""
  if (
    /already registered|already been registered|duplicate|exists/i.test(msg)
  ) {
    console.log(
      "User already exists. Sign in at /sign-in with:\n\n" +
        `  Email:    ${DEV_EMAIL}\n` +
        `  Password: ${DEV_PASSWORD}\n`,
    )
    process.exit(0)
  }
  console.error("Supabase error:", error.message)
  process.exit(1)
}

console.log(
  "Created dev user. Sign in at /sign-in with:\n\n" +
    `  Email:    ${DEV_EMAIL}\n` +
    `  Password: ${DEV_PASSWORD}\n`,
)
