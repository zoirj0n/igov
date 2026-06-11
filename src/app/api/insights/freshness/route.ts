import { getCurrentUser } from "@/lib/auth/server";
import { COUNTRIES } from "@/lib/data/countries";
import { indicatorsByCountry } from "@/lib/data/indicators";
import { getStatus } from "@/services/ingest/runner";
import { liveByCountry } from "@/services/ingest/store";
import type { Indicator } from "@/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTHORITATIVE_PREFIXES = [
  "World Bank",
  "IMF",
  "Ember",
  "OECD",
  "IEA",
  "IRENA",
  "UN",
  "WEF",
  "IMD",
  "Climate Watch",
  "EIA",
  "BP",
  "WTO",
  "UNCTAD",
];
const SEED_PROXIES = new Set([
  "DXB Annual Report",
  "Etihad Rail",
  "Jebel Ali",
  "MoEI",
  "Mock",
  "Seed",
]);

type Provenance = "authoritative" | "user" | "seed";

function provenance(src: string): Provenance {
  if (!src) return "seed";
  if (src.startsWith("csv:") || src.startsWith("ai-extract:")) return "user";
  if (SEED_PROXIES.has(src)) return "seed";
  for (const p of AUTHORITATIVE_PREFIXES) {
    if (src === p || src.startsWith(`${p} `)) return "authoritative";
  }
  return "user";
}

interface CountryFreshness {
  iso3: string;
  total: number;
  authoritative: number;
  user: number;
  seed: number;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const totals = { authoritative: 0, user: 0, seed: 0 };
  const perCountry: CountryFreshness[] = [];

  for (const c of COUNTRIES) {
    const live = liveByCountry(c.iso3);
    const seed = indicatorsByCountry(c.iso3);
    const merged: Indicator[] = [
      ...live,
      ...seed.filter((s) => !live.some((l) => l.metric === s.metric && l.year === s.year)),
    ];
    const row: CountryFreshness = {
      iso3: c.iso3,
      total: merged.length,
      authoritative: 0,
      user: 0,
      seed: 0,
    };
    for (const i of merged) {
      const p = provenance(i.source);
      row[p]++;
      totals[p]++;
    }
    perCountry.push(row);
  }

  perCountry.sort((a, b) => b.total - a.total);

  const runners = getStatus().map((s) => ({
    key: s.key,
    source: s.source,
    status: s.status,
    freshness: s.freshness,
    lastFinishedAt: s.lastRun?.finishedAt ?? null,
    lastStartedAt: s.lastRun?.startedAt ?? null,
    lastDurationMs: s.lastRun?.durationMs ?? 0,
    lastRows: s.lastRun?.rowsUpserted ?? 0,
    lastErrors: s.lastRun?.errors.length ?? 0,
    errorSample: (s.lastRun?.errors ?? []).slice(0, 5),
    history: (s.history ?? []).slice(-14),
  }));

  return NextResponse.json({
    totals,
    countries: COUNTRIES.length,
    grandTotal: totals.authoritative + totals.user + totals.seed,
    perCountry,
    runners,
  });
}
