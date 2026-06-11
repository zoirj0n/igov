"use client";

import { Skeleton } from "@/components/shared/Skeleton";
import { hasRole, useAuthedUser } from "@/lib/auth/client";
import { COUNTRIES } from "@/lib/data/countries";
import { useI18n } from "@/lib/i18n/context";
import type { Briefing } from "@/types";
import { useEffect, useState } from "react";

const badgeClass: Record<string, string> = {
  public: "bg-ink-100 text-ink-600",
  internal: "bg-accent-subtle text-accent",
  confidential: "bg-amber-100 text-amber-800",
  secret: "bg-red-100 text-red-800",
};

export function RecentBriefings() {
  const { locale, t } = useI18n();
  const { user } = useAuthedUser();
  const canCreate = hasRole(user, "analyst");
  const [data, setData] = useState<Briefing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/briefings")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as { briefings: Briefing[] };
      })
      .then((d) => {
        if (!cancelled) setData(d.briefings.slice(0, 5));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-sm border border-ink-200 bg-ink-100">
      <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-ink-800">
          {t.dashboard.recentBriefings}
        </h2>
        {canCreate && (
          <a
            href="/briefings/new"
            className="rounded-sm bg-accent px-3 py-1 text-xs text-white hover:bg-accent-strong"
          >
            + {t.common.generate}
          </a>
        )}
      </header>
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="border-b border-signal-risk/30 bg-signal-risk/10 px-5 py-2 text-[11px] text-signal-risk"
        >
          {error}
        </div>
      )}
      <ul className="divide-y divide-ink-100">
        {data === null && !error && (
          <li className="px-5 py-3 space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </li>
        )}
        {data && data.length === 0 && (
          <li className="px-5 py-6 text-center text-xs text-ink-400">{t.shell.empty}</li>
        )}
        {(data ?? []).map((b) => {
          const country = COUNTRIES.find((c) => c.iso3 === b.countryIso3);
          const countryName = country
            ? locale === "ar"
              ? country.nameAr
              : country.nameEn
            : b.countryIso3;
          return (
            <li key={b.id} className="px-5 py-3 transition hover:bg-ink-150">
              <a href={`/briefings/${b.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-800">{b.title}</div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {country?.flagEmoji} {countryName} · {b.audience}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-sm px-2 py-0.5 text-[11px] font-medium ${badgeClass[b.classification]}`}
                  >
                    {t.common.classification[b.classification]}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-ink-400 font-mono">
                  {new Date(b.createdAt).toISOString().slice(0, 10)} · {b.createdBy}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
