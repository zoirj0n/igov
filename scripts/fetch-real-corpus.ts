/* eslint-disable no-console */
/**
 * Fetch real public-domain text for each seeded country and ingest into RAG.
 *
 * Sources:
 *   1. Wikipedia REST API (EN + AR) — clean text extract per country
 *   2. World Bank country overview (HTML, stripped to text)
 *
 * Usage:
 *   pnpm fetch:corpus
 *   EVAL_BASE_URL=http://x pnpm fetch:corpus
 */

import { htmlToText } from "../src/services/rag/html-text";

interface Country {
  iso3: string;
  nameEn: string;
  nameAr: string;
  wbCode?: string; // World Bank 2-letter code, lowercase, e.g. "ae"
  wikiEn?: string; // override default title
  wikiAr?: string;
}

const COUNTRIES: Country[] = [
  { iso3: "ARE", nameEn: "United Arab Emirates", nameAr: "الإمارات_العربية_المتحدة", wbCode: "ae" },
  { iso3: "SAU", nameEn: "Saudi Arabia", nameAr: "المملكة_العربية_السعودية", wbCode: "sa" },
  { iso3: "USA", nameEn: "United States", nameAr: "الولايات_المتحدة", wbCode: "us" },
  { iso3: "GBR", nameEn: "United Kingdom", nameAr: "المملكة_المتحدة", wbCode: "gb" },
  { iso3: "FRA", nameEn: "France", nameAr: "فرنسا", wbCode: "fr" },
  { iso3: "DEU", nameEn: "Germany", nameAr: "ألمانيا", wbCode: "de" },
  { iso3: "JPN", nameEn: "Japan", nameAr: "اليابان", wbCode: "jp" },
  {
    iso3: "KOR",
    nameEn: "South Korea",
    nameAr: "كوريا_الجنوبية",
    wbCode: "kr",
    wikiEn: "South_Korea",
  },
  { iso3: "CHN", nameEn: "China", nameAr: "الصين", wbCode: "cn" },
  { iso3: "IND", nameEn: "India", nameAr: "الهند", wbCode: "in" },
  { iso3: "BRA", nameEn: "Brazil", nameAr: "البرازيل", wbCode: "br" },
  { iso3: "ZAF", nameEn: "South Africa", nameAr: "جنوب_أفريقيا", wbCode: "za" },
];

const BASE = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:3001";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.ae";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "demo";
const SLEEP_MS = Number(process.env.FETCH_SLEEP_MS ?? "750");

async function loginCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/ci_session=[^;]+/);
  if (!m) throw new Error("no session cookie");
  return m[0];
}

async function ingest(args: {
  cookie: string;
  docId: string;
  text: string;
  source: string;
  iso3: string;
  lang: "en" | "ar";
}): Promise<{ chunks: number; vendor: string } | null> {
  const res = await fetch(`${BASE}/api/admin/rag/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: args.cookie },
    body: JSON.stringify({
      kind: "text",
      docId: args.docId,
      text: args.text,
      source: args.source,
      classification: "public",
      iso3: args.iso3,
      lang: args.lang,
    }),
  });
  const data = (await res.json()) as { chunks?: number; embedVendor?: string; error?: string };
  if (!res.ok) {
    console.log(`    ✗ ${args.docId}: ${data.error ?? `HTTP ${res.status}`}`);
    return null;
  }
  return { chunks: data.chunks ?? 0, vendor: data.embedVendor ?? "?" };
}

async function fetchWikipedia(title: string, lang: "en" | "ar"): Promise<string | null> {
  // REST summary endpoint gives clean { extract: "..." } JSON.
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "CountryIntel/1.0 (gov-research)",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.log(`    wiki ${lang} HTTP ${res.status} for "${title}"`);
      return null;
    }
    const data = (await res.json()) as { extract?: string };
    return data.extract && data.extract.length > 200 ? data.extract : null;
  } catch (err) {
    console.log(
      `    wiki ${lang} fetch error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function fetchWorldBankCountry(wbCode: string): Promise<string | null> {
  // World Bank country pages — HTML, English. Strip to text.
  const url = `https://www.worldbank.org/en/country/${wbCode.toLowerCase()}/overview`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "text/html",
        "user-agent": "CountryIntel/1.0 (gov-research)",
      },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) {
      console.log(`    worldbank HTTP ${res.status} for ${wbCode}`);
      return null;
    }
    const html = await res.text();
    const text = htmlToText(html);
    // Trim to ~6000 chars of meaningful body — the WB pages have heavy nav/footer.
    return text.length > 500 ? text.slice(0, 12_000) : null;
  } catch (err) {
    console.log(`    worldbank fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  console.log(`\n  Fetching real RAG corpus → ${BASE}\n`);
  const cookie = await loginCookie();
  let ok = 0;
  let fail = 0;

  for (const c of COUNTRIES) {
    console.log(`\n  [${c.iso3}] ${c.nameEn}`);

    // Wikipedia EN
    const wikiEnTitle = c.wikiEn ?? c.nameEn.replace(/ /g, "_");
    const wEn = await fetchWikipedia(wikiEnTitle, "en");
    if (wEn) {
      const r = await ingest({
        cookie,
        docId: `doc:wiki:en:${c.iso3.toLowerCase()}`,
        text: wEn,
        source: "wikipedia_en",
        iso3: c.iso3,
        lang: "en",
      });
      if (r) {
        console.log(`    ✓ wiki/en → ${r.chunks} chunks (${r.vendor})`);
        ok++;
      } else fail++;
    } else {
      fail++;
    }

    await sleep(SLEEP_MS);

    // Wikipedia AR
    const wikiArTitle = c.wikiAr ?? c.nameAr;
    const wAr = await fetchWikipedia(wikiArTitle, "ar");
    if (wAr) {
      const r = await ingest({
        cookie,
        docId: `doc:wiki:ar:${c.iso3.toLowerCase()}`,
        text: wAr,
        source: "wikipedia_ar",
        iso3: c.iso3,
        lang: "ar",
      });
      if (r) {
        console.log(`    ✓ wiki/ar → ${r.chunks} chunks (${r.vendor})`);
        ok++;
      } else fail++;
    } else {
      fail++;
    }

    await sleep(SLEEP_MS);

    // World Bank country overview
    if (c.wbCode) {
      const wb = await fetchWorldBankCountry(c.wbCode);
      if (wb) {
        const r = await ingest({
          cookie,
          docId: `doc:wb:overview:${c.iso3.toLowerCase()}`,
          text: wb,
          source: "world_bank",
          iso3: c.iso3,
          lang: "en",
        });
        if (r) {
          console.log(`    ✓ wb/overview → ${r.chunks} chunks (${r.vendor})`);
          ok++;
        } else fail++;
      } else {
        fail++;
      }
      await sleep(SLEEP_MS);
    }
  }

  console.log(`\n  Done — ${ok} succeeded, ${fail} failed (${COUNTRIES.length} countries)\n`);
}

main().catch((err) => {
  console.error("fetch failed:", err);
  process.exit(1);
});
