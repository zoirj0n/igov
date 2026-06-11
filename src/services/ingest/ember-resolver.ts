declare global {
  // eslint-disable-next-line no-var
  var __ciEmberCache: { ts: number; url: string } | undefined;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INDEX_URLS = [
  "https://ember-energy.org/data/yearly-electricity-data/",
  "https://ember-climate.org/data/data-tools/yearly-electricity-data/",
];

export async function resolveEmberCsvUrl(): Promise<string | null> {
  const override = process.env.EMBER_CSV_URL;
  if (override) return override;

  const cached = globalThis.__ciEmberCache;
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.url;

  for (const indexUrl of INDEX_URLS) {
    try {
      const res = await fetch(indexUrl, {
        headers: { accept: "text/html", "user-agent": "CountryIntel/1.0 (ember-resolver)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const url = extractCsvLink(html);
      if (url) {
        globalThis.__ciEmberCache = { ts: Date.now(), url };
        return url;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function extractCsvLink(html: string): string | null {
  const patterns = [
    /href="(https?:\/\/[^"]+yearly_electricity_data[^"]*\.csv)"/i,
    /href="(https?:\/\/[^"]+monthly_electricity_data[^"]*\.csv)"/i,
    /href="(https?:\/\/[^"]+\.csv)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}
