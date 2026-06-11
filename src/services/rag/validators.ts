import {
  type FigRef,
  extractCites,
  extractFigs,
  splitSentences,
  stripCite,
  stripFig,
} from "./parser";

export interface VerifiedFact {
  id: string;
  label_en?: string;
  label_ar?: string;
  value: number;
  unit: string;
  year: number;
  source: string;
  /** "int" treats round-equal, default float treats ±0.5% */
  valueType?: "int" | "float";
}

export interface Passage {
  id: string;
  text: string;
  source: string;
  score?: number;
}

export interface Violation {
  kind:
    | "fig.unknown_id"
    | "fig.unit_unconvertible"
    | "fig.value_mismatch"
    | "cite.unknown_id"
    | "cite.missing";
  detail: string;
  span?: { start: number; end: number };
}

export interface CitationCheck {
  text: string; // possibly modified
  violations: Violation[];
}

/** Drop factual sentences whose claim has no valid <cite id>. */
export function validateCitations(textIn: string, passages: Passage[]): CitationCheck {
  const passageIds = new Set(passages.map((p) => p.id));
  const violations: Violation[] = [];
  const sentences = splitSentences(textIn);
  // Decide per-sentence first using ORIGINAL textIn (stable indices). Then
  // rebuild output by concatenating kept sentences. Prior implementation
  // sliced from a mutating `out` buffer using original indices — worked by
  // accident only when walked in reverse; fragile.
  const decisions = sentences.map((s) => {
    const slice = textIn.slice(s.start, s.end);
    // Trim leading whitespace before factuality test so "  China." still
    // matches the proper-noun branch (otherwise the leading-space regex
    // anchor in isFactual misfires).
    const trimmedSlice = slice.replace(/^\s+/, "");
    const cites = extractCites(slice);
    const valid = cites.filter((c) => passageIds.has(c.id));
    const drop = valid.length === 0 && isFactual(trimmedSlice);
    if (drop) {
      violations.push({
        kind: "cite.missing",
        detail: `Sentence has no valid <cite>: ${slice.slice(0, 80)}`,
        span: { start: s.start, end: s.end },
      });
    } else {
      for (const c of cites) {
        if (!passageIds.has(c.id)) {
          violations.push({
            kind: "cite.unknown_id",
            detail: `Unknown cite id: ${c.id}`,
          });
        }
      }
    }
    return { span: s, drop };
  });
  // Rebuild output: keep gaps between sentences (punctuation, whitespace).
  let cursor = 0;
  let out = "";
  for (const { span, drop } of decisions) {
    out += textIn.slice(cursor, span.start);
    if (!drop) out += textIn.slice(span.start, span.end);
    cursor = span.end;
  }
  out += textIn.slice(cursor);
  return { text: out.replace(/\s{2,}/g, " ").trim(), violations };
}

/**
 * Heuristic: a sentence is factual (needs citation) if it contains:
 *   - a digit (year, value, percentage), OR
 *   - a proper noun (capitalized word ≥ 3 chars), OR
 *   - a relational preposition followed by Title Case ("in China", "by 2025").
 * Lowercased sentence-initial words are skipped via the substring check.
 *
 * Previously only matched the relational-prep pattern, missing
 * proper-noun-only sentences like "China produced oil."
 */
function isFactual(s: string): boolean {
  if (/\d/.test(s)) return true;
  // Strip leading whitespace so first word's capitalization is checked,
  // but require at least one OTHER capitalized word (anywhere) to avoid
  // false-positives on every sentence (since first word is typically capitalized).
  const trimmed = s.trim();
  const afterFirst = trimmed.replace(/^\S+\s*/, "");
  if (/\b[A-Z][a-zA-Z]{2,}/.test(afterFirst)) return true;
  // Proper-noun-only single-word subject ("Germany imports oil.")
  if (/^[A-Z][a-zA-Z]{2,}\b/.test(trimmed)) return true;
  return false;
}

export interface FigureCheck {
  text: string;
  violations: Violation[];
  /** ids of figs that survived */
  passed: string[];
}

/**
 * Parse number from human text. Strips commas, percent, currency symbols.
 * Returns null if non-numeric.
 */
export function parseNumberText(t: string): number | null {
  const cleaned = t.replace(/[,\s$€£¥%]/g, "");
  // Handle trillion/billion/million suffixes
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)([kmbtKMBT]|trillion|billion|million|thousand)?$/i);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return null;
    const mult = m[2]?.toLowerCase();
    const scale: Record<string, number> = {
      k: 1e3,
      thousand: 1e3,
      m: 1e6,
      million: 1e6,
      b: 1e9,
      billion: 1e9,
      t: 1e12,
      trillion: 1e12,
    };
    return n * (mult ? (scale[mult] ?? 1) : 1);
  }
  // Loose case: extract first numeric chunk + look for word suffix elsewhere
  const num = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!num) return null;
  const n = Number(num[0]);
  if (!Number.isFinite(n)) return null;
  const word = /trillion|billion|million|thousand/i.exec(t);
  if (word) {
    const w = word[0].toLowerCase();
    const sc: Record<string, number> = {
      thousand: 1e3,
      million: 1e6,
      billion: 1e9,
      trillion: 1e12,
    };
    return n * (sc[w] ?? 1);
  }
  return n;
}

/**
 * Normalize a value from emittedUnit to canonicalUnit.
 * Returns null if unconvertible. v1: same-unit pass-through + simple percent/%.
 * Extend with currency conversion later via daily-rate source.
 */
export function convertUnit(value: number, emitted: string, canonical: string): number | null {
  const e = emitted.trim().toLowerCase();
  const c = canonical.trim().toLowerCase();
  if (e === c) return value;
  // percent alias
  if (
    (e === "%" || e === "percent" || e === "pct") &&
    (c === "%" || c === "percent" || c === "pct")
  )
    return value;
  // USD pass-through when canonical missing
  if (!c && (e === "usd" || e === "$")) return value;
  // Unconvertible — return null so caller flags as violation
  return null;
}

export function validateFigures(textIn: string, facts: Record<string, VerifiedFact>): FigureCheck {
  const figs = extractFigs(textIn);
  const violations: Violation[] = [];
  const passed: string[] = [];
  // Walk in reverse so strips don't shift earlier indices.
  let out = textIn;
  for (let i = figs.length - 1; i >= 0; i--) {
    const f = figs[i]!;
    const fact = facts[f.id];
    if (!fact) {
      violations.push({
        kind: "fig.unknown_id",
        detail: `Unknown fact id: ${f.id}`,
        span: { start: f.start, end: f.end },
      });
      out = stripFig(out, f);
      continue;
    }
    const claimed = parseNumberText(f.text);
    if (claimed === null) {
      violations.push({
        kind: "fig.value_mismatch",
        detail: `Non-numeric fig body: ${f.text}`,
        span: { start: f.start, end: f.end },
      });
      out = stripFig(out, f);
      continue;
    }
    const converted = convertUnit(claimed, f.unit, fact.unit);
    if (converted === null) {
      violations.push({
        kind: "fig.unit_unconvertible",
        detail: `Cannot convert ${f.unit} → ${fact.unit}`,
        span: { start: f.start, end: f.end },
      });
      out = stripFig(out, f);
      continue;
    }
    // Float tolerance: ±0.5% of |value|, with absolute floor of 1e-6 so
    // value=0 facts don't degenerate to zero tolerance (any rounding noise
    // would falsely fail the round-trip).
    const ok =
      fact.valueType === "int"
        ? Math.round(converted) === Math.round(fact.value)
        : Math.abs(converted - fact.value) <= Math.max(0.005 * Math.abs(fact.value), 1e-6);
    if (!ok) {
      violations.push({
        kind: "fig.value_mismatch",
        detail: `${converted} ≠ ${fact.value} ${fact.unit} (id=${f.id})`,
        span: { start: f.start, end: f.end },
      });
      out = stripFig(out, f);
      continue;
    }
    passed.push(f.id);
  }
  return { text: out, violations, passed };
}

export interface AbstentionConfig {
  minTopScore: number; // default 0.35
  minEntityCoverage: number; // default 0.60
}

function envFloat(name: string, dflt: number): number {
  const v = process.env[name];
  if (!v) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

export const DEFAULT_ABSTENTION: AbstentionConfig = {
  minTopScore: envFloat("RAG_MIN_TOP_SCORE", 0.35),
  minEntityCoverage: envFloat("RAG_MIN_ENTITY_COVERAGE", 0.6),
};

export interface AbstentionCheck {
  abstained: boolean;
  reasons: string[];
}

export function shouldAbstain(args: {
  intent: "factual" | "greeting" | "meta" | "smalltalk" | "help";
  passages: Passage[];
  questionEntities: string[];
  coveredEntities: string[];
  isNumeric: boolean;
  hasMatchingFact: boolean;
  config?: AbstentionConfig;
}): AbstentionCheck {
  const reasons: string[] = [];
  if (args.intent !== "factual") return { abstained: false, reasons: [] };
  const cfg = args.config ?? DEFAULT_ABSTENTION;
  const topScore = Math.max(0, ...args.passages.map((p) => p.score ?? 0));
  if (topScore < cfg.minTopScore) {
    reasons.push(`top rerank score ${topScore.toFixed(2)} < ${cfg.minTopScore}`);
  }
  // Country-grounded factual queries that name NO country are out of scope.
  // Prior logic set coverage=1 when questionEntities=[], permitting them
  // through — but the platform is country-intel; ungrounded factual queries
  // ("random question", "tell me a fact") have no grounding to validate
  // against. Treat empty-entity factual queries as low-coverage.
  if (args.questionEntities.length === 0) {
    reasons.push("factual question names no country entity (ungrounded)");
  } else {
    const coverage = args.coveredEntities.length / args.questionEntities.length;
    if (coverage < cfg.minEntityCoverage) {
      reasons.push(`entity coverage ${coverage.toFixed(2)} < ${cfg.minEntityCoverage}`);
    }
  }
  if (args.isNumeric && !args.hasMatchingFact) {
    reasons.push("numeric question with no matching verified fact");
  }
  return { abstained: reasons.length > 0, reasons };
}
