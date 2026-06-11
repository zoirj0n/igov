/**
 * Rerank provider abstraction.
 *
 * Providers:
 *   - cohere   (cloud · rerank-multilingual-v3.0)
 *   - local    (on-prem · cross-encoder via local API, e.g. ollama-bge-reranker or
 *              an OpenAI-compatible rerank server). v1 falls back to text-similarity
 *              score against the query embedding when no real reranker is reachable.
 */

import type { Classification } from "@/types";
import { logLlmCall } from "./call-log";
import { type ProviderName, isCloud, resolveProvider } from "./config";

export interface RerankPassage {
  id: string;
  text: string;
}

export interface RerankRequest {
  query: string;
  passages: RerankPassage[];
  topK: number;
  classification: Classification;
}

export interface RerankedPassage extends RerankPassage {
  score: number;
}

export type RerankVendor = "cohere" | "local" | "mock";

export interface RerankResult {
  passages: RerankedPassage[];
  model: string;
  vendor: RerankVendor;
  providerTier: ProviderName;
  usedRealApi: boolean;
}

export class RerankCloudClassError extends Error {
  constructor(
    public classification: Classification,
    public provider: ProviderName,
  ) {
    super(`rerank for classification "${classification}" cannot use cloud provider "${provider}"`);
    this.name = "RerankCloudClassError";
  }
}

const COHERE_KEY = process.env.COHERE_API_KEY;
const COHERE_MODEL = process.env.COHERE_MODEL ?? "rerank-multilingual-v3.0";
const LOCAL_RERANK_URL = process.env.LOCAL_RERANK_URL; // e.g. http://localhost:8080/rerank

function gate(classification: Classification, provider: ProviderName): void {
  if (isCloud(provider) && (classification === "confidential" || classification === "secret")) {
    throw new RerankCloudClassError(classification, provider);
  }
}

async function cohereRerank(req: RerankRequest, tier: ProviderName): Promise<RerankResult> {
  if (!COHERE_KEY) return mockRerank(req, "cohere", COHERE_MODEL, tier, "COHERE_API_KEY not set");
  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      authorization: `Bearer ${COHERE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      query: req.query,
      documents: req.passages.map((p) => p.text),
      top_n: req.topK,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`cohere ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: { index: number; relevance_score: number }[] };
  const out: RerankedPassage[] = (data.results ?? []).map((r) => {
    const p = req.passages[r.index]!;
    return { id: p.id, text: p.text, score: r.relevance_score };
  });
  return {
    passages: out,
    model: COHERE_MODEL,
    vendor: "cohere",
    providerTier: tier,
    usedRealApi: true,
  };
}

async function localRerank(req: RerankRequest): Promise<RerankResult> {
  if (!LOCAL_RERANK_URL)
    return mockRerank(req, "local", "local-mock", "local", "LOCAL_RERANK_URL not set");
  try {
    const res = await fetch(LOCAL_RERANK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: req.query,
        passages: req.passages,
        top_k: req.topK,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`local rerank ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = (await res.json()) as { results?: { id: string; score: number }[] };
    const byId = new Map(req.passages.map((p) => [p.id, p]));
    const out: RerankedPassage[] = (data.results ?? [])
      .slice(0, req.topK)
      .map((r) => {
        const p = byId.get(r.id);
        return p ? { id: p.id, text: p.text, score: r.score } : null;
      })
      .filter((x): x is RerankedPassage => x !== null);
    return {
      passages: out,
      model: "local-rerank",
      vendor: "local",
      providerTier: "local",
      usedRealApi: true,
    };
  } catch (err) {
    return mockRerank(
      req,
      "local",
      "local-mock",
      "local",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Mock rerank: BM25 scoring (Okapi). Replaces previous raw-overlap heuristic.
 * Real rerankers (Cohere / bge-reranker) are cross-encoders that score
 * query-passage semantic relevance; BM25 is purely lexical, so this still
 * undershoots a real reranker on paraphrase/synonym queries. But it's the
 * standard IR baseline and gives meaningful ranking signal in dev/no-key mode.
 *
 * Params:
 *   k1 = 1.5  → term-frequency saturation control
 *   b  = 0.75 → document-length normalization weight
 */
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "are",
  "was",
  "were",
  "but",
  "not",
  "you",
  "all",
  "can",
  "has",
  "have",
  "had",
  "his",
  "her",
  "its",
  "our",
  "your",
  "their",
  "what",
  "when",
  "where",
  "which",
  "who",
  "how",
]);

function tokenize(text: string): string[] {
  // Unicode-aware: \p{L} matches any letter (Arabic, CJK, etc), \p{N} any
  // number. Prior ASCII-only /[a-z0-9]+/ killed Arabic recall.
  const raw = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.map((t) => t.toLowerCase()).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function mockRerank(
  req: RerankRequest,
  vendor: RerankVendor,
  model: string,
  tier: ProviderName,
  reason: string,
): RerankResult {
  const queryTokens = Array.from(new Set(tokenize(req.query)));
  // Document-frequency map for IDF over the candidate set.
  const docFreq = new Map<string, number>();
  const docTokens = req.passages.map((p) => tokenize(p.text));
  const docLengths = docTokens.map((toks) => toks.length);
  const avgDocLen = docLengths.reduce((s, n) => s + n, 0) / Math.max(1, docLengths.length);
  for (const toks of docTokens) {
    const seen = new Set(toks);
    for (const t of seen) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const N = req.passages.length;
  const k1 = 1.5;
  const b = 0.75;
  function idf(t: string): number {
    const df = docFreq.get(t) ?? 0;
    // Smoothed IDF (BM25+): clamps to >= 0
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }
  const scored = req.passages.map((p, i) => {
    const toks = docTokens[i] ?? [];
    const len = docLengths[i] ?? 0;
    if (len === 0) return { id: p.id, text: p.text, score: 0 };
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const qt of queryTokens) {
      const f = tf.get(qt) ?? 0;
      if (f === 0) continue;
      const numer = f * (k1 + 1);
      const denom = f + k1 * (1 - b + b * (len / Math.max(1, avgDocLen)));
      score += idf(qt) * (numer / denom);
    }
    return { id: p.id, text: p.text, score };
  });
  scored.sort((a, b) => b.score - a.score);
  console.warn(`[rerank] mock vendor=${vendor} BM25 (${reason})`);
  return {
    passages: scored.slice(0, req.topK),
    model: `mock:${model}`,
    vendor: "mock",
    providerTier: tier,
    usedRealApi: false,
  };
}

export async function rerank(
  req: RerankRequest & { actor?: string; reqId?: string; sessionId?: string },
): Promise<RerankResult> {
  const target = resolveProvider(req.classification);
  gate(req.classification, target);
  // Offline mode: same as embed — block cloud reranker (Cohere) when offline.
  const { enforceOfflineGate } = await import("./config");
  enforceOfflineGate(target);
  const t0 = Date.now();
  const promptChars = req.query.length + req.passages.reduce((s, p) => s + p.text.length, 0);
  let result: RerankResult;
  let errorClass: string | undefined;
  try {
    result = target === "local" ? await localRerank(req) : await cohereRerank(req, target);
  } catch (err) {
    // Parity with embed.ts: degrade to mockRerank on API errors so the pipeline
    // still ranks something (with reduced quality) instead of crashing.
    errorClass = err instanceof Error ? err.name : "Error";
    const reason = `${target}_api_error: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`;
    logLlmCall({
      actor: req.actor ?? "system",
      reqId: req.reqId,
      sessionId: req.sessionId,
      step: "rerank",
      provider: target,
      model: target === "local" ? "local-rerank" : COHERE_MODEL,
      classification: req.classification,
      promptChars,
      completionChars: 0,
      durationMs: Date.now() - t0,
      usedRealApi: false,
      errorClass,
    });
    result = mockRerank(
      req,
      target === "local" ? "local" : "cohere",
      target === "local" ? "local-mock" : COHERE_MODEL,
      target,
      reason,
    );
  }
  logLlmCall({
    actor: req.actor ?? "system",
    reqId: req.reqId,
    sessionId: req.sessionId,
    step: "rerank",
    provider: target,
    model: result.model,
    classification: req.classification,
    promptChars,
    completionChars: 0,
    durationMs: Date.now() - t0,
    usedRealApi: result.usedRealApi,
  });
  return result;
}
