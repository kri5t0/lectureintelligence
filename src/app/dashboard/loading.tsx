export default function DashboardLoading() {
  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="h-4 w-40 animate-pulse bg-muted" />
          <div className="h-9 w-20 animate-pulse bg-muted" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-10 h-10 max-w-sm animate-pulse bg-muted" />
        <div className="h-64 animate-pulse bg-muted" />
      </main>
    </div>
  )
}
