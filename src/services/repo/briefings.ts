import { BRIEFINGS as MOCK } from "@/lib/data/briefings";
import { dbEnabled, query } from "@/services/database";
import type { Briefing } from "@/types";

declare global {
  // eslint-disable-next-line no-var
  var __ciBriefingsMem: Briefing[] | undefined;
}
const memStore: Briefing[] = globalThis.__ciBriefingsMem ?? [];
if (!globalThis.__ciBriefingsMem) globalThis.__ciBriefingsMem = memStore;

interface BriefingRow {
  id: string;
  title: string;
  country_iso3: string;
  audience: string;
  classification: "public" | "internal" | "confidential" | "secret";
  created_by: string | null;
  created_at: string;
  body: string;
  talking_points: string[] | null;
  risks: string[] | null;
  opportunities: string[] | null;
  citations: string[] | null;
  confidence: "high" | "med" | "low" | null;
}

function mapRow(r: BriefingRow): Briefing {
  return {
    id: r.id,
    title: r.title,
    countryIso3: r.country_iso3,
    audience: r.audience,
    classification: r.classification,
    createdBy: r.created_by ?? "system",
    createdAt: r.created_at,
    body: r.body,
    talkingPoints: r.talking_points ?? undefined,
    risks: r.risks ?? undefined,
    opportunities: r.opportunities ?? undefined,
    citations: r.citations ?? undefined,
    confidence: r.confidence ?? undefined,
  };
}

export async function listBriefings(): Promise<Briefing[]> {
  if (!dbEnabled()) return [...memStore, ...MOCK];
  try {
    const rows = await query<BriefingRow>(
      `SELECT id, title, country_iso3, audience, classification, created_by, created_at::text,
              body, talking_points, risks, opportunities, citations, confidence
       FROM briefings ORDER BY created_at DESC LIMIT 200`,
    );
    return rows.map(mapRow);
  } catch {
    return [...memStore, ...MOCK];
  }
}

export async function findBriefing(id: string): Promise<Briefing | undefined> {
  const mem = memStore.find((b) => b.id === id);
  if (mem) return mem;
  if (!dbEnabled()) return MOCK.find((b) => b.id === id);
  try {
    const rows = await query<BriefingRow>(
      `SELECT id, title, country_iso3, audience, classification, created_by, created_at::text,
              body, talking_points, risks, opportunities, citations, confidence
       FROM briefings WHERE id = $1`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : undefined;
  } catch {
    return MOCK.find((b) => b.id === id);
  }
}

export async function saveBriefing(b: Briefing): Promise<Briefing> {
  // Always keep in-process store for instant list refresh; persist to DB when enabled.
  memStore.unshift(b);
  if (memStore.length > 500) memStore.length = 500;
  if (!dbEnabled()) return b;
  try {
    await query(
      `INSERT INTO briefings (
         id, title, country_iso3, audience, classification, created_by, created_at,
         body, talking_points, risks, opportunities, citations, confidence
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title, body = EXCLUDED.body,
         talking_points = EXCLUDED.talking_points, risks = EXCLUDED.risks,
         opportunities = EXCLUDED.opportunities, citations = EXCLUDED.citations,
         confidence = EXCLUDED.confidence`,
      [
        b.id,
        b.title,
        b.countryIso3,
        b.audience,
        b.classification,
        b.createdBy,
        b.createdAt,
        b.body,
        b.talkingPoints ?? null,
        b.risks ?? null,
        b.opportunities ?? null,
        b.citations ?? null,
        b.confidence ?? null,
      ],
    );
  } catch {
    // DB write failed; mem store still holds it.
  }
  return b;
}
