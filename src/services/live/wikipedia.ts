/**
 * Wikipedia — public bio + photo for the counterpart agent. MediaWiki search
 * resolves the page title; the REST summary endpoint returns extract +
 * thumbnail. Public data API (no key); sovereignty gates don't apply, but the
 * air-gap toggle does: offline ⇒ null, callers fall back to seeds/initials.
 *
 * Guard rails: search results are filtered to titles that actually NAME the
 * person, and the resolved page must read like a human biography before its
 * photo/extract are trusted — a wrong-photo dossier (e.g. a Chinese expressway
 * for "Xi Jinping China") is worse than no photo at all.
 */
import { isAirgapped, withCache, withTimeout } from "@/services/live/runtime";

export interface WikiPerson {
  title: string;
  extract: string;
  description?: string;
  thumbnailUrl?: string;
  pageUrl: string;
  live: boolean;
}

export function parseWikiSearchTitles(j: unknown): string[] {
  const arr = (j as { query?: { search?: { title?: string }[] } })?.query?.search ?? [];
  return arr.map((r) => r?.title).filter((t): t is string => typeof t === "string" && t.length > 0);
}

function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Pure: pick the search result whose title actually names the person (or null). */
export function pickPersonTitle(name: string, titles: string[]): string | null {
  const want = nameTokens(name);
  if (want.length === 0) return null;
  let best: { title: string; score: number } | null = null;
  for (const title of titles) {
    const have = new Set(nameTokens(title));
    const hits = want.filter((w) => have.has(w)).length;
    const score = hits / want.length;
    if (score >= 0.5 && (!best || score > best.score)) best = { title, score };
  }
  return best?.title ?? null;
}

const PERSON_RE =
  /\b(born|politician|minister|president|chairman|chairwoman|premier|secretary|chancellor|diplomat|official|senator|deputy|governor|economist|lawyer|jurist|general|admiral|royal|prince|princess|sheikh|emir|businessman|businesswoman|executive)\b/i;
const NON_PERSON_RE =
  /\b(road|highway|expressway|motorway|bridge|railway|metro|river|mountain|lake|island|city|town|village|province|district|county|prefecture|company|corporation|airline|airport|stadium|museum|university|ministry|album|film|song|band|species|genus)\b/i;

/** Pure: does the resolved page describe a human (vs a road, city, company…)? */
export function looksLikePerson(p: Pick<WikiPerson, "extract" | "description">): boolean {
  const text = `${p.description ?? ""} ${p.extract}`.slice(0, 400);
  if (PERSON_RE.test(text)) return true;
  // No person signal: anything that names a place/thing — or that we simply
  // can't classify — is refused. A missing photo beats a wrong one.
  return false;
}

export function parseWikiSummary(j: unknown): WikiPerson | null {
  const o = j as {
    title?: string;
    extract?: string;
    description?: string;
    thumbnail?: { source?: string };
    content_urls?: { desktop?: { page?: string } };
  } | null;
  if (!o?.title) return null;
  return {
    title: o.title,
    extract: o.extract ?? "",
    description: o.description,
    thumbnailUrl: o.thumbnail?.source,
    pageUrl:
      o.content_urls?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(o.title)}`,
    live: true,
  };
}

const UA = { "user-agent": "country-intel-platform/1.0 (gov demo)" };

async function searchTitles(query: string): Promise<string[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=${encodeURIComponent(query)}`;
  const res = await withTimeout(fetch(url, { headers: UA }), 10_000, "wikipedia-search");
  if (!res.ok) throw new Error(`wikipedia search ${res.status}`);
  return parseWikiSearchTitles(await res.json());
}

/**
 * Resolve a person's Wikipedia summary. Tries the bare name first (most
 * precise for well-known figures), then name + hint (disambiguates lesser-known
 * officials); each candidate must pass the title-match and person-page gates.
 */
export async function wikiPersonSummary(name: string, hint?: string): Promise<WikiPerson | null> {
  if (isAirgapped()) return null;
  return withCache<WikiPerson | null>(
    `wiki:person:${name.toLowerCase()}:${(hint ?? "").toLowerCase()}`,
    24 * 60 * 60 * 1000,
    async () => {
      const queries = hint ? [name, `${name} ${hint}`] : [name];
      for (const q of queries) {
        const title = pickPersonTitle(name, await searchTitles(q));
        if (!title) continue;
        const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const res = await withTimeout(fetch(sumUrl, { headers: UA }), 10_000, "wikipedia-summary");
        if (!res.ok) continue;
        const person = parseWikiSummary(await res.json());
        if (person && looksLikePerson(person)) return person;
      }
      return null;
    },
    () => null,
  );
}
