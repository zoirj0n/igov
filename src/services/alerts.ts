/**
 * Smart Radar — monitoring signals derived from the latest real indicators
 * (no fabricated news feed). Each alert is a thresholded, sourced read on a
 * country's data, so the "what" and the "why" are always inspectable.
 */
import type { IndicatorPoint } from "@/services/agent/state";

export type AlertCategory =
  | "energy"
  | "growth"
  | "investment"
  | "trade"
  | "digital"
  | "sustainability";
export type AlertSeverity = "info" | "watch" | "high";

export interface Alert {
  id: string;
  iso3: string;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  detail: string;
  year: number;
}

const SEV_RANK: Record<AlertSeverity, number> = { high: 3, watch: 2, info: 1 };

function fmtUsd(v: number): string {
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  return `$${Math.round(v).toLocaleString()}`;
}

/** Pure: derive alerts for one country from its indicator rows. */
export function alertsForCountry(iso3: string, rows: IndicatorPoint[]): Alert[] {
  const m = new Map(rows.map((r) => [r.code, r]));
  const out: Alert[] = [];
  const push = (
    category: AlertCategory,
    severity: AlertSeverity,
    title: string,
    detail: string,
    year: number,
  ) => out.push({ id: `${iso3}-${category}`, iso3, category, severity, title, detail, year });

  const renew = m.get("renew_share");
  if (renew && renew.value >= 35)
    push(
      "energy",
      renew.value >= 50 ? "high" : "watch",
      "Clean-energy partner signal",
      `Renewables at ${renew.value.toFixed(1)}% of energy — green-hydrogen / offtake potential.`,
      renew.year,
    );

  const growth = m.get("gdp_growth");
  if (growth && growth.value >= 5)
    push(
      "growth",
      "high",
      "High-growth market",
      `GDP growth ${growth.value.toFixed(1)}% — expanding demand.`,
      growth.year,
    );
  else if (growth && growth.value < 0)
    push(
      "growth",
      "watch",
      "Economic contraction",
      `GDP growth ${growth.value.toFixed(1)}% — monitor exposure.`,
      growth.year,
    );

  const fdi = m.get("fdi");
  if (fdi && fdi.value >= 50e9)
    push(
      "investment",
      fdi.value >= 150e9 ? "high" : "watch",
      "Major FDI hub",
      `${fmtUsd(fdi.value)} FDI inflows — investment corridor opportunity.`,
      fdi.year,
    );

  const exports = m.get("exports");
  if (exports && exports.value >= 1e12)
    push(
      "trade",
      "high",
      "Top-tier exporter",
      `${fmtUsd(exports.value)} exports — CEPA / trade-deepening candidate.`,
      exports.year,
    );

  const internet = m.get("internet_users");
  if (internet && internet.value >= 90)
    push(
      "digital",
      "info",
      "Advanced digital market",
      `${internet.value.toFixed(0)}% online — smart-gov & digital-infra alignment.`,
      internet.year,
    );

  const co2 = m.get("co2");
  if (co2 && co2.value >= 12)
    push(
      "sustainability",
      "watch",
      "High carbon intensity",
      `${co2.value.toFixed(1)}t CO₂ per capita — decarbonisation cooperation angle.`,
      co2.year,
    );

  return out;
}

/** Pure: build + rank alerts across countries (most severe first). */
export function buildAlerts(countries: { iso3: string; rows: IndicatorPoint[] }[]): Alert[] {
  const all = countries.flatMap((c) => alertsForCountry(c.iso3, c.rows));
  return all.sort(
    (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || a.iso3.localeCompare(b.iso3),
  );
}
