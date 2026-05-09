import { Suspense } from "react"
import type { Metadata } from "next"
import { SignInForm } from "@/components/sign-in-form"

export const metadata: Metadata = {
  title: "Sign in",
}

function SignInFallback() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInForm />
    </Suspense>
  )
}
