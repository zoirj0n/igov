"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface error to ops console.
    console.error("[app/error]", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-ink-50 px-6">
      <div className="w-full max-w-md">
        <div className="mb-6 inline-flex items-center gap-2 rounded-md bg-signal-risk/10 px-2.5 py-1 text-xs font-medium text-signal-risk">
          <span aria-hidden>●</span>
          <span>Application error</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-800">Something broke.</h1>
        <p className="mt-2 text-sm text-ink-500">
          The page failed to render. Logs include the request ID if you need to file an issue.
        </p>
        <pre className="mt-4 max-h-40 overflow-auto rounded-md border border-ink-150 bg-ink-100 p-3 text-2xs text-ink-700">
          {error.message || "Unknown error"}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2 text-sm text-ink-700 transition hover:border-ink-300"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
