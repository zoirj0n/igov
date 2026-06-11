/* eslint-disable no-console */
/**
 * RAG eval harness. Hits a running dev server on http://127.0.0.1:3001 (override with EVAL_BASE_URL).
 *
 * Usage:
 *   pnpm eval                            # run all goldens, print table
 *   EVAL_THRESHOLD=0.85 pnpm eval        # exit 1 if pass-rate < threshold
 *   EVAL_EMAIL=lead@example.ae pnpm eval # login as another seed user
 *
 * Login is required; the script logs in via the stub seed creds at startup.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

interface Golden {
  id: string;
  question: string;
  intent: "factual" | "greeting" | "meta" | "smalltalk" | "help";
  entities: string[];
  shouldAbstain: boolean;
  isNumeric?: boolean;
  lang?: "en" | "ar";
  expectFacts?: boolean;
  /** Max acceptable validator violations; defaults to 0. Useful while embeddings are mocked. */
  maxViolations?: number;
  note?: string;
}

interface Scored {
  id: string;
  question: string;
  passed: boolean;
  reasons: string[];
  durationMs: number;
  meta: {
    intent: string;
    entities: string[];
    abstained: boolean;
    factCount: number;
    citationCount: number;
    violationCount: number;
  };
}

const BASE = process.env.EVAL_BASE_URL ?? "http://127.0.0.1:3001";
const EMAIL = process.env.EVAL_EMAIL ?? "analyst@example.ae";
const PASSWORD = process.env.EVAL_PASSWORD ?? "demo";
// Mock-embedding baseline: ~65%. Real voyage/ollama embeddings push >90%.
const THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? "0.60");

async function loginCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/ci_session=[^;]+/);
  if (!m) throw new Error("no session cookie in login response");
  return m[0];
}

async function runOne(g: Golden, cookie: string): Promise<Scored> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/rag`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ question: g.question }),
  });
  const dur = Date.now() - t0;
  const data = (await res.json()) as {
    intent: string;
    abstained: boolean;
    abstainReasons?: string[];
    citations: string[];
    facts: unknown[];
    violations: unknown[];
    meta?: { entities: string[]; lang: string; topScore: number };
  };

  const reasons: string[] = [];
  if (!res.ok) reasons.push(`HTTP ${res.status}`);
  if (data.intent !== g.intent) reasons.push(`intent ${data.intent}≠${g.intent}`);
  const gotEntities = new Set(data.meta?.entities ?? []);
  for (const e of g.entities) {
    if (!gotEntities.has(e)) reasons.push(`missing entity ${e}`);
  }
  if (data.abstained !== g.shouldAbstain) {
    const why = data.abstainReasons?.length ? ` [${data.abstainReasons.join(", ")}]` : "";
    reasons.push(`abstain ${data.abstained}≠${g.shouldAbstain}${why}`);
  }
  if (g.expectFacts && data.facts.length === 0) reasons.push("expected facts, got none");
  const allowedViolations = g.maxViolations ?? 0;
  if (data.violations.length > allowedViolations)
    reasons.push(`${data.violations.length} violations (allowed ${allowedViolations})`);
  if (g.lang && data.meta?.lang !== g.lang) reasons.push(`lang ${data.meta?.lang}≠${g.lang}`);
  if (g.intent === "factual" && !g.shouldAbstain && data.citations.length === 0) {
    reasons.push("expected citations, got none");
  }

  return {
    id: g.id,
    question: g.question,
    passed: reasons.length === 0,
    reasons,
    durationMs: dur,
    meta: {
      intent: data.intent,
      entities: Array.from(gotEntities),
      abstained: data.abstained,
      factCount: data.facts.length,
      citationCount: data.citations.length,
      violationCount: data.violations.length,
    },
  };
}

function colorize(s: string, ok: boolean): string {
  return ok ? `\x1b[32m${s}\x1b[0m` : `\x1b[31m${s}\x1b[0m`;
}

async function main(): Promise<void> {
  const file = path.join(process.cwd(), "tests", "eval", "golden.jsonl");
  const raw = await readFile(file, "utf-8");
  const goldens: Golden[] = raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Golden);

  console.log(`\n  RAG eval against ${BASE}`);
  console.log(
    `  Goldens: ${goldens.length} · Threshold: ${(THRESHOLD * 100).toFixed(0)}% pass rate\n`,
  );

  const cookie = await loginCookie();

  const results: Scored[] = [];
  for (const g of goldens) {
    try {
      const r = await runOne(g, cookie);
      results.push(r);
      const mark = colorize(r.passed ? "✓" : "✗", r.passed);
      const q = g.question.length > 50 ? `${g.question.slice(0, 47)}…` : g.question.padEnd(50);
      console.log(`  ${mark} ${g.id} ${q} ${r.durationMs}ms`);
      if (!r.passed) console.log(`      └─ ${r.reasons.join(" · ")}`);
    } catch (err) {
      results.push({
        id: g.id,
        question: g.question,
        passed: false,
        reasons: [err instanceof Error ? err.message : String(err)],
        durationMs: 0,
        meta: {
          intent: "?",
          entities: [],
          abstained: false,
          factCount: 0,
          citationCount: 0,
          violationCount: 0,
        },
      });
      console.log(`  ${colorize("✗", false)} ${g.id} ${g.question} (ERROR)`);
      console.log(`      └─ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const passRate = passed / results.length;

  console.log("");
  console.log(`  Summary: ${passed}/${results.length} passed (${(passRate * 100).toFixed(1)}%)`);
  console.log(
    `  Avg duration: ${Math.round(results.reduce((s, r) => s + r.durationMs, 0) / results.length)}ms`,
  );

  // Per-category breakdown
  const byCat = new Map<string, { passed: number; total: number }>();
  for (const g of goldens) {
    const r = results.find((x) => x.id === g.id);
    if (!r) continue;
    const cat = g.intent;
    const cur = byCat.get(cat) ?? { passed: 0, total: 0 };
    cur.total++;
    if (r.passed) cur.passed++;
    byCat.set(cat, cur);
  }
  console.log("  By intent:");
  for (const [cat, s] of byCat.entries()) {
    console.log(`    ${cat.padEnd(10)} ${s.passed}/${s.total}`);
  }

  if (passRate < THRESHOLD) {
    console.log(
      `\n  ${colorize("REGRESSION", false)}: pass rate ${(passRate * 100).toFixed(1)}% < threshold ${(THRESHOLD * 100).toFixed(0)}%\n`,
    );
    process.exit(1);
  } else {
    console.log(`\n  ${colorize("OK", true)}: pass rate above threshold\n`);
  }
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exit(2);
});
