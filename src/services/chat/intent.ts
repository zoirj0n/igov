/**
 * Deterministic triage for the landing ask box. No LLM call: prepare-phrasing
 * and country extraction are regex/dictionary work; everything else goes to
 * the RAG pipeline which does its own (deeper) intent handling.
 */
import { ISO_COUNTRIES, resolveCountryFromText } from "@/lib/data/iso-countries";

export type AskKind = "prepare" | "compare" | "general";

export interface AskTriage {
  kind: AskKind;
  countries: string[];
}

/** All countries named in the text, in first-appearance order, capped at 3. */
export function resolveCountriesFromText(text: string): string[] {
  const hay = ` ${text.toLowerCase()} `;
  const hits: { iso3: string; at: number }[] = [];

  // Longest-name-first so "United Arab Emirates" wins over partial overlaps.
  const byLen = [...ISO_COUNTRIES].sort((a, b) => b.name.length - a.name.length);
  for (const c of byLen) {
    const idx = hay.indexOf(` ${c.name.toLowerCase()}`);
    if (idx >= 0 && !hits.some((h) => h.iso3 === c.iso3)) hits.push({ iso3: c.iso3, at: idx });
  }
  // Aliases / ISO3 tokens via the existing single resolver, scanned per word
  // window so multiple short forms ("uae", "ksa", DEU) are all caught.
  const words = text.split(/[^A-Za-z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const win = words.slice(i, i + 3).join(" ");
    const iso = resolveCountryFromText(win);
    if (iso && !hits.some((h) => h.iso3 === iso)) {
      hits.push({ iso3: iso, at: text.toLowerCase().indexOf((words[i] as string).toLowerCase()) });
    }
  }
  return hits
    .sort((a, b) => a.at - b.at)
    .slice(0, 3)
    .map((h) => h.iso3);
}

const PREPARE_RE = /\b(prepare me|brief me|prep me|get me ready|جهزني|جهّزني)\b/i;

export function classifyAsk(text: string): AskTriage {
  const countries = resolveCountriesFromText(text);
  if (PREPARE_RE.test(text) && countries.length > 0) {
    return { kind: "prepare", countries: [countries[0] as string] };
  }
  if (countries.length >= 2) return { kind: "compare", countries: countries.slice(0, 2) };
  return { kind: "general", countries };
}
