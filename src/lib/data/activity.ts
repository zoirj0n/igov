export type ActivityKind = "briefing" | "ingest" | "ai" | "user" | "system";

export interface Activity {
  id: string;
  kind: ActivityKind;
  actor: string;
  title: string;
  detail: string;
  ts: string;
}

export const ACTIVITY: Activity[] = [
  {
    id: "a-001",
    kind: "ingest",
    actor: "etl:worldbank",
    title: "World Bank batch upserted",
    detail: "14 indicators · 4 countries · run 3.4s",
    ts: "2026-05-22T02:48:00Z",
  },
  {
    id: "a-002",
    kind: "briefing",
    actor: "analyst.a",
    title: "Briefing generated · DEU",
    detail: "Audience: Minister of Energy · confidence high",
    ts: "2026-05-22T02:42:00Z",
  },
  {
    id: "a-003",
    kind: "ai",
    actor: "claude",
    title: "Chat session 24m · 14 turns",
    detail: "Topics: hydrogen, NDC alignment, cooperation",
    ts: "2026-05-22T02:35:00Z",
  },
  {
    id: "a-004",
    kind: "user",
    actor: "analyst.b",
    title: "Logged in",
    detail: "via UAE PASS · MFA verified · IP rotated",
    ts: "2026-05-22T02:21:00Z",
  },
  {
    id: "a-005",
    kind: "system",
    actor: "scheduler",
    title: "Daily ingest run started",
    detail: "Sources: World Bank, IRENA, IMF, UN Comtrade",
    ts: "2026-05-22T02:00:00Z",
  },
  {
    id: "a-006",
    kind: "briefing",
    actor: "analyst.c",
    title: "Briefing exported · IND",
    detail: "Format PDF · classification Internal",
    ts: "2026-05-21T23:14:00Z",
  },
  {
    id: "a-007",
    kind: "ingest",
    actor: "etl:irena",
    title: "Renewables snapshot ingested",
    detail: "12 countries · 9 indicators · run 5.1s",
    ts: "2026-05-21T21:33:00Z",
  },
  {
    id: "a-008",
    kind: "ai",
    actor: "claude",
    title: "Video script generated · JPN",
    detail: "60s · Society 5.0 framing · 4 variants",
    ts: "2026-05-21T20:05:00Z",
  },
];
