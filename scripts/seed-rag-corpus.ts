/* eslint-disable no-console */
/**
 * Seed small canonical RAG snippets for evaluation + demo.
 *
 * Usage:
 *   pnpm seed:rag                   # default base
 *   EVAL_BASE_URL=http://x pnpm seed:rag
 *
 * Idempotent: same docId always overwrites. No effect on validators or
 * per-source manifest; this populates ONLY the RAG chunk store.
 */

interface SeedDoc {
  docId: string;
  source: string;
  iso3?: string;
  lang: "en" | "ar";
  classification: "public" | "internal" | "confidential" | "secret";
  text: string;
}

const SEEDS: SeedDoc[] = [
  {
    docId: "doc:wb:are-overview-2024",
    source: "world_bank",
    iso3: "ARE",
    lang: "en",
    classification: "internal",
    text: "United Arab Emirates GDP in 2024 reached approximately 507 billion USD per World Bank Open Data. Population stood at 9.89 million. UAE Energy Strategy 2050 targets 50 percent clean energy in the electricity mix. Renewables share rose to 8 percent in 2024. Oil output averaged 4.0 million barrels per day. Foreign direct investment inflows totaled 26 billion USD. The country is the third-largest Arab economy.",
  },
  {
    docId: "doc:wb:sau-overview-2024",
    source: "world_bank",
    iso3: "SAU",
    lang: "en",
    classification: "internal",
    text: "Saudi Arabia GDP in 2024 reached 1.067 trillion USD per World Bank Open Data, growing 2.7 percent year on year. Population was 36.9 million. Oil output averaged 9.0 million barrels per day. Renewables share of electricity was 1.0 percent. Foreign direct investment inflows totaled 26 billion USD. Saudi Vision 2030 drives economic diversification away from hydrocarbons. Non-oil GDP grew at 4.2 percent.",
  },
  {
    docId: "doc:wb:deu-overview-2024",
    source: "world_bank",
    iso3: "DEU",
    lang: "en",
    classification: "internal",
    text: "Germany GDP in 2024 reached 4.5 trillion USD per World Bank Open Data, contracting 0.1 percent year on year. Population was 84.5 million. Renewables share of electricity reached 54 percent. CO2 emissions per capita declined to 8.0 tonnes. Germany leads EU industrial output and remains the third-largest economy globally. Energy imports diversified after 2022 with five LNG terminals operational.",
  },
  {
    docId: "doc:wb:fra-overview-2024",
    source: "world_bank",
    iso3: "FRA",
    lang: "en",
    classification: "internal",
    text: "France GDP in 2024 reached 3.05 trillion USD per World Bank Open Data, growing 1.1 percent. Population was 68.4 million. Nuclear provides about 65 percent of electricity. Renewables share was 25 percent. CO2 emissions per capita stood at 4.6 tonnes. France leads EU aerospace and luxury exports. Foreign direct investment inflows totaled 38 billion USD.",
  },
  {
    docId: "doc:wb:ind-overview-2024",
    source: "world_bank",
    iso3: "IND",
    lang: "en",
    classification: "internal",
    text: "India GDP in 2024 reached 3.94 trillion USD per World Bank Open Data, growing 6.7 percent year on year — the fastest among major economies. Population was 1.43 billion in 2024. Coal still dominates electricity generation but renewables share rose to 23 percent. CO2 emissions per capita 2.0 tonnes. India became the world's third-largest economy by PPP. Foreign direct investment inflows totaled 71 billion USD.",
  },
  {
    docId: "doc:wb:jpn-overview-2024",
    source: "world_bank",
    iso3: "JPN",
    lang: "en",
    classification: "internal",
    text: "Japan GDP in 2024 reached 4.21 trillion USD per World Bank Open Data, growing 0.9 percent. Population was 124 million and declining. Japan leads smart city investments through Society 5.0 framework with 200+ municipal pilot projects. Renewables share 22 percent of electricity. Aging population drives automation and robotics investment. Foreign direct investment inflows totaled 9.8 billion USD.",
  },
  {
    docId: "doc:wb:kor-overview-2024",
    source: "world_bank",
    iso3: "KOR",
    lang: "en",
    classification: "internal",
    text: "Republic of Korea GDP in 2024 reached 1.71 trillion USD per World Bank Open Data, growing 2.0 percent. Population was 51.7 million. Semiconductor exports drive trade surplus. Renewables share of electricity 9 percent. K-New Deal targets 50 percent clean energy by 2034. Foreign direct investment inflows totaled 28 billion USD.",
  },
  {
    docId: "doc:wb:are-overview-ar-2024",
    source: "world_bank",
    iso3: "ARE",
    lang: "ar",
    classification: "internal",
    text: "بلغ الناتج المحلي الإجمالي للإمارات العربية المتحدة في عام 2024 حوالي 507 مليار دولار أمريكي وفقاً لبيانات البنك الدولي. وصل عدد السكان إلى 9.89 مليون نسمة. تستهدف استراتيجية الطاقة الإماراتية 2050 خمسين بالمائة من الطاقة النظيفة في مزيج الكهرباء. ارتفعت حصة الطاقة المتجددة إلى 8 بالمائة في 2024. وبلغ متوسط إنتاج النفط 4.0 ملايين برميل يومياً.",
  },
];

const BASE = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:3001";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.ae";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "demo";

async function loginCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/ci_session=[^;]+/);
  if (!m) throw new Error("no session cookie in login response");
  return m[0];
}

async function ingest(d: SeedDoc, cookie: string): Promise<void> {
  const res = await fetch(`${BASE}/api/admin/rag/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      kind: "text",
      docId: d.docId,
      text: d.text,
      source: d.source,
      classification: d.classification,
      iso3: d.iso3,
      lang: d.lang,
    }),
  });
  const data = (await res.json()) as {
    chunks?: number;
    embedded?: number;
    embedVendor?: string;
    error?: string;
  };
  if (!res.ok) {
    console.log(`  ✗ ${d.docId} → ${data.error ?? `HTTP ${res.status}`}`);
    return;
  }
  console.log(
    `  ✓ ${d.docId} (${d.iso3 ?? "—"}/${d.lang}) → ${data.chunks} chunks · ${data.embedVendor}`,
  );
}

async function main(): Promise<void> {
  console.log(`\n  Seeding RAG corpus → ${BASE}\n`);
  const cookie = await loginCookie();
  for (const d of SEEDS) {
    try {
      await ingest(d, cookie);
    } catch (err) {
      console.log(`  ✗ ${d.docId} → ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\n  Done — ${SEEDS.length} docs requested\n`);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
