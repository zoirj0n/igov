/**
 * Tolerant tag extractor for RAG-grounded LLM output.
 * Grammar:
 *   <fig id="FACT_ID" unit="UNIT">human-readable number</fig>
 *   <cite id="CHUNK_ID"/>      (or open+close: <cite id="X"></cite>)
 *
 * Accepts double/single/no quotes, missing self-close slash, smart quotes.
 * Returns extracted refs; never throws.
 */

export interface FigRef {
  id: string;
  unit: string;
  text: string; // inner text, raw
  start: number; // index in source
  end: number;
  raw: string; // full <fig ...>...</fig> substring
}

export interface CiteRef {
  id: string;
  start: number;
  end: number;
  raw: string;
}

const SMART_QUOTES_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
};

export function normalizeQuotes(s: string): string {
  return s.replace(/[‘’‚“”„]/g, (ch) => SMART_QUOTES_MAP[ch] ?? ch);
}

function attrValue(raw: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s/>]+))`, "i");
  const m = re.exec(raw);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

export function extractFigs(textIn: string): FigRef[] {
  const text = normalizeQuotes(textIn);
  const out: FigRef[] = [];
  const re = /<fig\b([^>]*)>([\s\S]*?)<\/fig>/gi;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const attrs = m[1] ?? "";
    const inner = m[2] ?? "";
    const id = attrValue(attrs, "id");
    const unit = attrValue(attrs, "unit");
    if (id) {
      out.push({
        id,
        unit: unit ?? "",
        text: inner.trim(),
        start: m.index,
        end: m.index + m[0].length,
        raw: m[0],
      });
    }
    m = re.exec(text);
  }
  return out;
}

export function extractCites(textIn: string): CiteRef[] {
  const text = normalizeQuotes(textIn);
  const out: CiteRef[] = [];
  // self-closing OR open/close
  const re = /<cite\b([^>]*?)\/?>(?:\s*<\/cite>)?/gi;
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    const attrs = m[1] ?? "";
    const id = attrValue(attrs, "id");
    if (id) {
      out.push({
        id,
        start: m.index,
        end: m.index + m[0].length,
        raw: m[0],
      });
    }
    m = re.exec(text);
  }
  return out;
}

/** Split into rough sentences for citation-coverage scan. Naive but deterministic. */
export function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const cleaned = normalizeQuotes(text);
  const out: { text: string; start: number; end: number }[] = [];
  // Match sentence-ending punctuation followed by space or EOL.
  const re = /[^.!?\n]+[.!?](?=\s|$)|[^.!?\n]+$/g;
  let m: RegExpExecArray | null = re.exec(cleaned);
  while (m !== null) {
    const s = m[0].trim();
    if (s) {
      out.push({ text: s, start: m.index, end: m.index + m[0].length });
    }
    m = re.exec(cleaned);
  }
  return out;
}

/**
 * Strip a fig (replace tag with inner text) — used by validator to remove violating tags
 * without breaking surrounding prose.
 */
export function stripFig(text: string, fig: FigRef): string {
  return text.slice(0, fig.start) + fig.text + text.slice(fig.end);
}

/** Strip a cite (remove tag entirely). */
export function stripCite(text: string, cite: CiteRef): string {
  return text.slice(0, cite.start) + text.slice(cite.end);
}
