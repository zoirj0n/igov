"use client";

import { type Role, landingFor } from "@/lib/auth/client";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useI18n } from "@/lib/i18n/context";
import { useEffect, useState } from "react";

interface OidcProvider {
  key: string;
  label: string;
}

const PRESETS = [
  { role: "analyst", email: "analyst@example.ae" },
  { role: "lead", email: "lead@example.ae" },
  { role: "executive", email: "exec@example.ae" },
  { role: "admin", email: "admin@example.ae" },
] as const;

function safeNext(raw: string): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/login")) return "/dashboard";
  if (raw.startsWith("/api/")) return "/dashboard";
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico|avif|css|js|json|map)$/i.test(raw)) return "/dashboard";
  return raw;
}

export function LoginForm({ next: rawNext }: { next: string }) {
  const { t } = useI18n();
  useDocumentTitle(t.auth.signIn);
  const next = safeNext(rawNext);
  const [email, setEmail] = useState("analyst@example.ae");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<OidcProvider[]>([]);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then(async (r) => (r.ok ? r.json() : { providers: [] }))
      .then((d: { providers: OidcProvider[] }) => setProviders(d.providers ?? []))
      .catch(() => setProviders([]));
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }
      // Deep links win; otherwise land on the role's home surface
      // (executives go straight to the Strategic Advisor).
      const role = (data as { user?: { role?: Role } }).user?.role;
      window.location.assign(rawNext ? next : landingFor(role));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-50 px-6">
      <div
        aria-hidden
        className="-z-10 pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(55% 45% at 50% 0%, rgba(146, 114, 42,0.16), transparent 70%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-ae-gold to-ae-goldDark" />
      <div className="w-full max-w-sm">
        <a href="/" className="mb-6 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-ae-gold font-bold text-white">
            ◈
          </span>
          <div>
            <div className="text-sm font-semibold text-ink-800">{t.appName}</div>
            <div className="text-2xs text-ink-400">{t.auth.ministry}</div>
          </div>
        </a>

        {providers.length > 0 && (
          <div className="mb-3 space-y-2 rounded-sm border border-ink-200 bg-ink-100 p-4">
            <div className="text-[11px] uppercase tracking-wide text-ink-500">
              {t.auth.signInVia}
            </div>
            {providers.map((p) => (
              <a
                key={p.key}
                href={`/api/auth/oidc/start?provider=${encodeURIComponent(p.key)}&next=${encodeURIComponent(next)}`}
                className="flex items-center justify-between rounded-sm border border-ink-200 bg-ink-100 px-3 py-2 text-sm text-ink-700 hover:border-accent hover:bg-ink-150"
              >
                <span>{p.label}</span>
                <span className="text-ink-400">→</span>
              </a>
            ))}
            <div className="pt-1 text-center text-[10px] uppercase tracking-wide text-ink-400">
              {t.auth.orStub}
            </div>
          </div>
        )}

        <form
          onSubmit={submit}
          className="space-y-3 rounded-xl border border-ink-200 bg-ink-100 p-6 shadow-card"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.auth.email}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-sm border border-ink-200 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.auth.password}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-sm border border-ink-200 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-sm border border-signal-risk/30 bg-signal-risk/10 px-3 py-2 text-xs text-signal-risk"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent-strong px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? t.auth.signingIn : t.auth.signIn}
          </button>

          <div className="border-t border-ink-100 pt-3">
            <div className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
              {t.auth.quickSwitch}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.email}
                  type="button"
                  onClick={() => setEmail(p.email)}
                  className={
                    email === p.email
                      ? "rounded-xs bg-accent px-2 py-1 text-[11px] text-white"
                      : "rounded-xs border border-ink-200 px-2 py-1 text-[11px] text-ink-600 hover:border-ink-400"
                  }
                >
                  {t.auth.roles[p.role]}
                </button>
              ))}
            </div>
            <div className="mt-2 font-mono text-[10px] text-ink-500">
              <strong>{t.auth.passwordHint}</strong> demo
            </div>
          </div>
        </form>

        <p className="mt-4 text-center text-[11px] text-ink-400">
          {providers.length > 0
            ? t.auth.oidcConfigured.replace("{list}", providers.map((p) => p.label).join(" · "))
            : t.auth.devNote}
        </p>
      </div>
    </main>
  );
}
