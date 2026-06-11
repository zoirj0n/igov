import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink-50 px-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-3 font-mono text-2xs uppercase tracking-wide text-ink-400">404</div>
        <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">Not found</h1>
        <p className="mt-2 text-sm text-ink-500">
          The page you requested doesn&rsquo;t exist or has been moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
          >
            Go to dashboard
          </Link>
          <Link
            href="/briefings"
            className="rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2 text-sm text-ink-700 transition hover:border-ink-300"
          >
            Briefings
          </Link>
        </div>
      </div>
    </main>
  );
}
