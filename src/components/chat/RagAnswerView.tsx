"use client";

import { type CiteRef, type FigRef, extractCites, extractFigs } from "@/services/rag/parser";
import { Fragment } from "react";

interface RagFact {
  id: string;
  value: number;
  unit: string;
  year: number;
  source: string;
}

interface RagPassage {
  id: string;
  source: string;
  score?: number;
}

interface Props {
  text: string;
  facts?: RagFact[];
  passages?: RagPassage[];
}

type Token =
  | { kind: "text"; text: string }
  | { kind: "fig"; ref: FigRef }
  | { kind: "cite"; ref: CiteRef };

function tokenize(text: string): Token[] {
  const figs = extractFigs(text);
  const cites = extractCites(text);
  const all: { start: number; end: number; tok: Token }[] = [
    ...figs.map((f) => ({ start: f.start, end: f.end, tok: { kind: "fig" as const, ref: f } })),
    ...cites.map((c) => ({ start: c.start, end: c.end, tok: { kind: "cite" as const, ref: c } })),
  ].sort((a, b) => a.start - b.start);
  const out: Token[] = [];
  let cursor = 0;
  for (const t of all) {
    if (t.start > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, t.start) });
    }
    out.push(t.tok);
    cursor = t.end;
  }
  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return n.toLocaleString();
  return n.toString();
}

export function RagAnswerView({ text, facts = [], passages = [] }: Props) {
  const factById = new Map(facts.map((f) => [f.id, f]));
  const passageById = new Map(passages.map((p) => [p.id, p]));
  const tokens = tokenize(text);

  // Number citations in order of first appearance
  const citeIndex = new Map<string, number>();
  for (const t of tokens) {
    if (t.kind === "cite" && !citeIndex.has(t.ref.id)) {
      citeIndex.set(t.ref.id, citeIndex.size + 1);
    }
  }

  return (
    <div className="text-sm leading-relaxed text-ink-800">
      {tokens.map((t, i) => {
        if (t.kind === "text") {
          // Preserve newlines + spaces
          return (
            <Fragment key={i}>
              {t.text
                .split(/(\n)/)
                .map((part, j) =>
                  part === "\n" ? (
                    <br key={`${i}-${j}`} />
                  ) : (
                    <Fragment key={`${i}-${j}`}>{part}</Fragment>
                  ),
                )}
            </Fragment>
          );
        }
        if (t.kind === "fig") {
          const fact = factById.get(t.ref.id);
          const tooltip = fact
            ? `${t.ref.id}\nVerified: ${formatNumber(fact.value)} ${fact.unit} · ${fact.year} · ${fact.source}`
            : `${t.ref.id} (unverified)`;
          const valid = Boolean(fact);
          return (
            <span
              key={i}
              title={tooltip}
              className={`mx-0.5 inline-flex items-baseline gap-1 rounded-xs px-1.5 py-0 align-baseline font-medium ${
                valid ? "bg-signal-ok/15 text-signal-ok" : "bg-signal-risk/15 text-signal-risk"
              }`}
            >
              <span>{t.ref.text}</span>
              {valid && <span className="font-mono text-[9px] text-signal-ok/70">✓</span>}
            </span>
          );
        }
        // cite
        const passage = passageById.get(t.ref.id);
        const n = citeIndex.get(t.ref.id);
        const valid = Boolean(passage);
        const tooltip = passage
          ? `[${n}] ${t.ref.id}\nsource: ${passage.source}${typeof passage.score === "number" ? ` · score ${passage.score.toFixed(2)}` : ""}`
          : `[${n}] ${t.ref.id} (unknown source)`;
        return (
          <sup
            key={i}
            title={tooltip}
            className={`ms-0.5 inline-block rounded-xs px-1 align-super text-[10px] font-medium ${
              valid
                ? "bg-accent/15 text-accent hover:bg-accent/25"
                : "bg-signal-risk/15 text-signal-risk"
            }`}
          >
            [{n ?? "?"}]
          </sup>
        );
      })}

      {/* Citation footer */}
      {citeIndex.size > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-2 text-2xs">
          <div className="font-medium uppercase tracking-wide text-ink-500">Sources</div>
          <ol className="mt-1 space-y-0.5">
            {Array.from(citeIndex.entries()).map(([id, n]) => {
              const p = passageById.get(id);
              return (
                <li key={id} className="font-mono text-ink-600">
                  <span className="me-1 text-accent">[{n}]</span>
                  <span>{id}</span>
                  {p && <span className="ms-2 text-ink-400">{p.source}</span>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
