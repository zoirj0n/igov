"use client";

import { InvestmentMap } from "@/components/experience/InvestmentMap";
import { investmentsFor, totalInvestmentUsd } from "@/lib/data/investments";
import { fmtUsd } from "@/lib/experience/format";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";

export function TradeView({
  state,
  iso3,
  countryName,
}: {
  state: AgentState;
  iso3: string;
  countryName: string;
}) {
  const { t } = useI18n();
  const x = t.experience.tradeView;
  const trade = state.trade;
  const deals = investmentsFor(iso3);
  const invTotal = totalInvestmentUsd(iso3);
  const fdi = state.indicators.find((i) => i.code.toLowerCase().includes("fdi"));
  const headlineUsd = invTotal > 0 ? invTotal : (trade?.totalUsd ?? 0);
  const headlineLabel = invTotal > 0 ? x.investmentHeadline : x.tradeHeadline;

  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl border border-ink-200 bg-ink-50/70 p-4">
      <p className="text-2xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-tamm-cyan">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-accent/30 bg-ink-100 p-5">
        <p className="inline-block rounded bg-accent/15 px-3 py-1 text-sm font-semibold text-accent-strong">
          {x.banner.replace("{country}", countryName)}
        </p>
        {trade ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {stat(x.total, fmtUsd(trade.totalUsd))}
              {stat(x.exports, fmtUsd(trade.exportsUsd), `↑ UAE → ${countryName}`)}
              {stat(x.imports, fmtUsd(trade.importsUsd), `↓ ${countryName} → UAE`)}
              {stat(
                x.balance,
                `${trade.exportsUsd - trade.importsUsd >= 0 ? "+" : "−"}${fmtUsd(Math.abs(trade.exportsUsd - trade.importsUsd))}`,
              )}
            </div>
            <p className="mt-3 text-2xs text-ink-400">
              {trade.source} · {trade.year}
              {fdi && (
                <span className="ms-3">
                  {x.fdi}: {fmtUsd(fdi.value)} ({fdi.source} · {fdi.year})
                </span>
              )}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-ink-500">{x.noTrade}</p>
        )}
      </div>

      <InvestmentMap
        iso3={iso3}
        countryName={countryName}
        headlineLabel={headlineLabel}
        headlineUsd={headlineUsd}
      />

      {deals.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">{x.deals}</h3>
          <ul className="mt-2 space-y-2">
            {deals.map((d) => (
              <li
                key={d.title}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800">{d.title}</p>
                  <p className="text-2xs text-ink-500">
                    {d.parties.join(" · ")} · {d.year} ·{" "}
                    <a
                      href={d.source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-strong hover:underline"
                    >
                      {d.source.name}
                    </a>
                  </p>
                </div>
                <span className="font-mono text-lg font-bold text-tamm-cyan">
                  {fmtUsd(d.valueUsd)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-2xs text-ink-400">{x.dealsNote}</p>
        </section>
      )}
    </div>
  );
}
