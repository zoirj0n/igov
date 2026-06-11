/**
 * Lightweight HTML → text extractor.
 * Removes <script>, <style>, <noscript>, comments.
 * Drops all other tags (keeping inner text), collapses whitespace,
 * normalizes &entities; for the common cases.
 * Not a full HTML parser — good enough for RAG ingestion + offline scrape.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

export function htmlToText(html: string): string {
  if (!html) return "";
  let out = html;
  // Drop comments
  out = out.replace(/<!--[\s\S]*?-->/g, " ");
  // Drop script/style/noscript blocks entirely
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  // Convert block-level tags to newlines to preserve paragraph structure
  out = out.replace(
    /<\s*(\/?)\s*(p|br|h[1-6]|li|div|tr|hr|article|section|figure|figcaption|blockquote|td|th)\s*\b[^>]*>/gi,
    "\n",
  );
  // Strip remaining tags
  out = out.replace(/<[^>]+>/g, " ");
  // Decode entities
  out = out.replace(/&(#?\w+);/g, (m, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const n = Number.parseInt(code.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (code.startsWith("#")) {
      const n = Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
  // Collapse whitespace
  out = out.replace(/[ \t]+/g, " ");
  out = out.replace(/\s*\n\s*/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
