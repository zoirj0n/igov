"use client";

import { DonutChart } from "@/components/shared/DonutChart";
import { fmtUsd } from "@/lib/experience/format";
import { useI18n } from "@/lib/i18n/context";
import type { CountryFacts } from "@/services/live/countryFacts";
import { useEffect, useState } from "react";

export function ProfileView({ iso3, countryName }: { iso3: string; countryName: string }) {
  const { t } = useI18n();
  const x = t.experience.profileView;
  const [facts, setFacts] = useState<CountryFacts | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let on = true;
    setStatus("loading");
    fetch(`/api/country-facts/${iso3}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { facts: CountryFacts }).facts : null))
      .then((f) => {
        if (!on) return;
        if (f) {
          setFacts(f);
          setStatus("ready");
        } else setStatus("error");
      })
      .catch(() => on && setStatus("error"));
    return () => {
      on = false;
    };
  }, [iso3]);

  if (status === "loading")
    return <p className="py-10 text-center text-sm text-ink-500">{x.loading}</p>;
  if (status === "error" || !facts)
    return <p className="py-10 text-center text-sm text-ink-500">{x.unavailable}</p>;

  const big = (label: string, value: string) => (
    <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
      <p className="text-2xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-900">{value}</p>
    </div>
  );
  const civic = (label: string, value?: string) =>
    value ? (
      <div className="flex items-baseline justify-between gap-3 border-b border-ink-150 py-2 text-sm last:border-0">
        <span className="text-ink-500">{label}</span>
        <span className="text-end font-medium text-ink-800">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold text-ink-900">{countryName}</h3>
        <span className="rounded-full border border-ink-200 px-2.5 py-0.5 font-mono text-2xs text-ink-500">
          {facts.source} · {facts.year} ·{" "}
          <span className={facts.live ? "text-signal-ok" : "text-tamm-olive"}>
            {facts.live ? x.liveBadge : x.seedBadge}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {facts.gdpPerCapitaUsd !== undefined &&
          big(x.gdpPerCapita, `$${Math.round(facts.gdpPerCapitaUsd).toLocaleString()}`)}
        {facts.populationM !== undefined && big(x.population, `${facts.populationM}`)}
        {facts.tradePctGdp !== undefined && big(x.tradePct, `${facts.tradePctGdp}%`)}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          {civic(x.capital, facts.capital)}
          {civic(x.currency, facts.currency)}
          {civic(x.politicalSystem, facts.politicalSystem)}
          {civic(x.language, facts.language)}
        </div>
        {facts.sectors && (
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
            <p className="mb-3 text-2xs uppercase tracking-wide text-ink-400">{x.sectors}</p>
            <DonutChart
              slices={[
                { label: x.agriculture, value: facts.sectors.agriculture, color: "#c0c171" },
                { label: x.industry, value: facts.sectors.industry, color: "#7c5e24" },
                { label: x.services, value: facts.sectors.services, color: "#d7bc6d" },
              ]}
              centerLabel="%"
            />
          </div>
        )}
      </div>
    </div>
  );
}
