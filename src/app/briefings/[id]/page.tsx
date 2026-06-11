"use client";

import { Skeleton } from "@/components/shared/Skeleton";
import { AppShell } from "@/components/shell/AppShell";
import { BRIEFINGS } from "@/lib/data/briefings";
import { COUNTRIES } from "@/lib/data/countries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import type { Briefing } from "@/types";
import { notFound, useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

const badgeClass: Record<string, string> = {
  public: "chip chip-muted",
  internal: "chip chip-info",
  confidential: "chip chip-warn",
  secret: "chip chip-risk",
};

export default function BriefingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const seed = BRIEFINGS.find((x) => x.id === id);
  const { t, locale } = useI18n();
  const { push } = useToast();
  const router = useRouter();
  const [b, setB] = useState<Briefing | null>(seed ?? null);
  useDocumentTitle(b?.title ?? "Briefing");
  const [loading, setLoading] = useState(seed === undefined);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "pptx" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/briefings/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) {
          const d = await r.json().catch(() => ({}));
          throw {
            kind: "forbidden",
            message: typeof d?.error === "string" ? d.error : "insufficient clearance",
          };
        }
        if (r.status === 404) {
          if (!seed) throw { kind: "notfound" };
          return seed;
        }
        const d = await r.json();
        if (!r.ok)
          throw {
            kind: "error",
            message: typeof d?.error === "string" ? d.error : `HTTP ${r.status}`,
          };
        return d as Briefing;
      })
      .then((d) => {
        if (cancelled) return;
        setB(d);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.kind === "forbidden") setForbidden(err.message);
        else if (err?.kind === "notfound") setError("not found");
        else setError(typeof err?.message === "string" ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, seed]);

  if (loading) {
    return (
      <AppShell>
        <article className="mx-auto max-w-3xl px-6 py-10 space-y-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </article>
      </AppShell>
    );
  }

  if (forbidden) {
    return (
      <AppShell>
        <main className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-signal-warn/10 px-2.5 py-1 text-xs font-medium uppercase text-signal-warn">
            <span aria-hidden>🔒</span>
            Clearance required
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-800">
            You can&rsquo;t open this briefing.
          </h1>
          <p className="mt-2 text-sm text-ink-500">{forbidden}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a href="/briefings" className="btn-primary text-xs">
              Back to briefings
            </a>
            <a href="/settings" className="btn-ghost text-xs">
              Settings
            </a>
          </div>
        </main>
      </AppShell>
    );
  }

  if (error && !b) {
    notFound();
  }
  if (!b) notFound();

  const country = COUNTRIES.find((c) => c.iso3 === b.countryIso3);
  const countryName = country ? (locale === "ar" ? country.nameAr : country.nameEn) : b.countryIso3;

  const briefingId = b.id;
  async function download(format: "pdf" | "pptx"): Promise<void> {
    setBusy(format);
    try {
      const res = await fetch(`/api/briefings/${briefingId}/export?format=${format}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(typeof err?.error === "string" ? err.error : `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1] ??
        `briefing.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      push({
        kind: "success",
        title: format === "pdf" ? "PDF downloaded" : "Deck downloaded",
        detail: filename,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push({ kind: "error", title: `Export failed (${format})`, detail: msg });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-6 py-10">
        <a
          href="/briefings"
          className="inline-flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-ink-500 transition hover:text-ink-800"
        >
          ← {t.common.back}
        </a>
        <header className="mt-4 border-b border-ink-100 pb-7">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span className="text-base leading-none">{country?.flagEmoji}</span>
            <span className="font-medium text-ink-700">{countryName}</span>
            <span className="text-ink-300">·</span>
            <span>{b.audience}</span>
            <span className={`ms-1 ${badgeClass[b.classification]}`}>
              {t.common.classification[b.classification]}
            </span>
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tighter text-ink-800">{b.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs">
            <span className="font-mono text-ink-500">
              {new Date(b.createdAt).toISOString().slice(0, 10)}
            </span>
            <span className="text-ink-300">·</span>
            <span className="font-mono text-ink-500">{b.createdBy}</span>
            {b.confidence && (
              <>
                <span className="text-ink-300">·</span>
                <span className="chip chip-info">confidence · {b.confidence}</span>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => download("pdf")}
              disabled={busy !== null}
              className="btn-ghost text-xs"
            >
              {busy === "pdf" ? "…" : t.briefings.exportPdf}
            </button>
            <button
              type="button"
              onClick={() => download("pptx")}
              disabled={busy !== null}
              className="btn-ghost text-xs"
            >
              {busy === "pptx" ? "…" : t.briefings.exportDeck}
            </button>
            <span className="mx-1 h-5 w-px bg-ink-150" aria-hidden />
            <button
              type="button"
              onClick={() => router.push(`/country/${b.countryIso3}`)}
              className="btn-ghost text-xs"
              title={`Open ${countryName} profile`}
            >
              {country?.flagEmoji} Profile
            </button>
            <button
              type="button"
              onClick={() => router.push(`/chat?context=country:${b.countryIso3}`)}
              className="btn-ghost text-xs"
              title="Open chat with this country preset"
            >
              💬 Discuss
            </button>
            <button
              type="button"
              onClick={() => router.push(`/cooperation?partner=${b.countryIso3}`)}
              className="btn-ghost text-xs"
            >
              🤝 Cooperation
            </button>
          </div>
        </header>

        <section className="mt-7 space-y-7">
          <p className="text-base leading-relaxed text-ink-800">{b.body}</p>

          {b.talkingPoints && b.talkingPoints.length > 0 && (
            <div>
              <h2 className="section-title mb-3">{t.briefings.talkingPoints}</h2>
              <ul className="space-y-2 text-sm text-ink-700">
                {b.talkingPoints.map((p, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden
                    />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {b.risks && b.risks.length > 0 && (
            <div>
              <h2 className="section-title mb-3">{t.briefings.risks}</h2>
              <ul className="space-y-2 text-sm text-ink-700">
                {b.risks.map((p, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-risk"
                      aria-hidden
                    />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {b.opportunities && b.opportunities.length > 0 && (
            <div>
              <h2 className="section-title mb-3">{t.briefings.opportunities}</h2>
              <ul className="space-y-2 text-sm text-ink-700">
                {b.opportunities.map((p, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-ok"
                      aria-hidden
                    />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <footer className="border-t border-ink-100 pt-4 font-mono text-2xs text-ink-400">
            {t.profile.sources} · {(b.citations ?? []).join(" · ") || "—"}
          </footer>
        </section>
      </article>
    </AppShell>
  );
}
