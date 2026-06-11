"use client";

import { AppShell } from "@/components/shell/AppShell";
import { COUNTRIES } from "@/lib/data/countries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useToast } from "@/lib/hooks/useToast";
import { useI18n } from "@/lib/i18n/context";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

interface BriefingResponse {
  id?: string;
  title: string;
  strategicOverview: string;
  talkingPoints: string[];
  risks: string[];
  opportunities: string[];
  citations: string[];
  confidence: "high" | "med" | "low";
}

export default function NewBriefingPage() {
  return (
    <Suspense fallback={null}>
      <NewBriefingPageInner />
    </Suspense>
  );
}

function NewBriefingPageInner() {
  useDocumentTitle("New briefing");
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const seedCountry = (() => {
    const q = sp?.get("country")?.toUpperCase();
    return q && COUNTRIES.some((c) => c.iso3 === q) ? q : "ARE";
  })();
  const [countryIso3, setCountryIso3] = useState(seedCountry);
  const [audience, setAudience] = useState("Minister of Energy");
  const [topics, setTopics] = useState("energy transition, hydrogen, bilateral cooperation");
  const [classification, setClassification] = useState<
    "public" | "internal" | "confidential" | "secret"
  >("internal");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BriefingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { push } = useToast();

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/briefings/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countryIso3,
          audience,
          topics: topics
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          classification,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setResult(data as BriefingResponse);
      push({
        kind: "success",
        title: "Briefing generated",
        detail: `${countryIso3} · ${audience}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      push({ kind: "error", title: "Generation failed", detail: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-10 lg:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink-800">
              {t.briefings.generatorTitle}
            </h1>
            <p className="mt-1 text-xs text-ink-500">Claude Opus 4.7 · classification-gated</p>
          </div>

          <div>
            <label
              htmlFor="bg-country"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.briefings.country_field}
            </label>
            <select
              id="bg-country"
              value={countryIso3}
              onChange={(e) => setCountryIso3(e.target.value)}
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            >
              {COUNTRIES.map((c) => (
                <option key={c.iso3} value={c.iso3}>
                  {c.flagEmoji} {locale === "ar" ? c.nameAr : c.nameEn}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="bg-aud"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.briefings.audience_field}
            </label>
            <input
              id="bg-aud"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="bg-topics"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              {t.briefings.topics_field}
            </label>
            <input
              id="bg-topics"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              placeholder="comma-separated"
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="bg-class"
              className="mb-1 block text-xs uppercase tracking-wide text-ink-500"
            >
              Classification
            </label>
            <select
              id="bg-class"
              value={classification}
              onChange={(e) => setClassification(e.target.value as typeof classification)}
              className="w-full rounded-md border border-ink-150 bg-ink-100 px-3 py-2 text-sm shadow-card transition focus:border-accent focus:outline-none"
            >
              <option value="public">{t.common.classification.public}</option>
              <option value="internal">{t.common.classification.internal}</option>
              <option value="confidential">{t.common.classification.confidential}</option>
              <option value="secret">{t.common.classification.secret}</option>
            </select>
          </div>

          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Generating…" : t.briefings.generate}
          </button>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-sm border border-signal-risk/30 bg-signal-risk/10 px-3 py-2 text-xs text-signal-risk"
            >
              {error}
            </div>
          )}
        </form>

        <article className="card p-6">
          {!result ? (
            <div className="grid h-full place-items-center text-sm text-ink-400">
              Output appears here.
            </div>
          ) : (
            <>
              <header className="mb-4 border-b border-ink-200 pb-4">
                <h2 className="text-2xl font-semibold tracking-tight text-ink-800">
                  {result.title}
                </h2>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
                  <span className="rounded-xs bg-accent-subtle px-1.5 py-0.5 text-accent">
                    {t.profile.confidence}: {result.confidence}
                  </span>
                  <span>·</span>
                  <span>{result.citations.join(" · ")}</span>
                </div>
                {result.id && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/briefings/${result.id}`} className="btn-primary text-xs">
                      Open full briefing →
                    </a>
                    <a href="/briefings" className="btn-ghost text-xs">
                      Back to list
                    </a>
                  </div>
                )}
              </header>
              <p className="text-base leading-relaxed text-ink-800">{result.strategicOverview}</p>

              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold tracking-tight text-ink-800">
                  {t.briefings.talkingPoints}
                </h3>
                <ul className="list-disc space-y-1 ps-5 text-sm text-ink-700">
                  {result.talkingPoints.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>

              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold tracking-tight text-ink-800">
                  {t.briefings.risks}
                </h3>
                <ul className="list-disc space-y-1 ps-5 text-sm text-ink-700">
                  {result.risks.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>

              <section className="mt-5">
                <h3 className="mb-2 text-sm font-semibold tracking-tight text-ink-800">
                  {t.briefings.opportunities}
                </h3>
                <ul className="list-disc space-y-1 ps-5 text-sm text-ink-700">
                  {result.opportunities.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </article>
      </div>
    </AppShell>
  );
}
