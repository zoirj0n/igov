/**
 * Hybrid retrieval: vector top-K ∪ BM25 top-K fused via Reciprocal Rank Fusion.
 *
 * Vector retrieval ranks on semantic similarity (good at paraphrase, synonyms);
 * BM25 ranks on lexical overlap with IDF + length normalization (good at exact
 * terms like proper nouns, numerics, technical jargon). RRF combines them
 * without needing score normalization: each doc's fused score is
 *   Σ 1 / (k + rank_i)  across all rankers it appears in.
 * k=60 is the canonical RRF constant (Cormack et al., SIGIR 2009).
 *
 * Cheaper + more recall than reranking the full union with a cross-encoder.
 * Hybrid runs in pre-rerank stage; downstream reranker still picks final top-N.
 */

import type { Classification } from "@/types";
import {
  type ScoredChunk,
  filterChunksByClearance,
  listChunks,
  topK as vectorTopK,
} from "./chunks";

const RRF_K = 60;

const BM25_K1 = 1.5;
const BM25_B = 0.75;

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
  // number. Prior ASCII-only /[a-z0-9]+/ killed BM25 signal on Arabic queries.
  const raw = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.map((t) => t.toLowerCase()).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function bm25TopK(args: {
  query: string;
  k: number;
  userClearance: Classification;
  filter?: { iso3?: string; lang?: "en" | "ar"; source?: string };
}): ScoredChunk[] {
  let filtered = listChunks(args.filter);
  if (filtered.length === 0 && args.filter?.lang) {
    const fallback = { ...args.filter, lang: undefined };
    filtered = listChunks(fallback);
  }
  const cleared = filterChunksByClearance(filtered, args.userClearance);
  if (cleared.length === 0) return [];

  // If all query terms got stopword-filtered, retry without the stoplist so
  // a meaningful BM25 signal survives (e.g. "who is the president of X" → all
  // stopwords except "president" + "X"; degenerate case: "the and for" → all
  // stopwords; we accept all tokens as fallback).
  let queryTokens = Array.from(new Set(tokenize(args.query)));
  if (queryTokens.length === 0) {
    // Stopword retry: keep all letter/digit runs (no stopword filter).
    const raw = (args.query.match(/[\p{L}\p{N}]+/gu) ?? [])
      .map((t) => t.toLowerCase())
      .filter((t) => t.length >= 2);
    queryTokens = Array.from(new Set(raw));
    if (queryTokens.length === 0) return [];
  }

  // Per-call IDF over the candidate set (post-clearance).
  const docTokens = cleared.map((c) => tokenize(c.text));
  const docLengths = docTokens.map((toks) => toks.length);
  const avgDocLen = docLengths.reduce((s, n) => s + n, 0) / Math.max(1, docLengths.length);
  const docFreq = new Map<string, number>();
  for (const toks of docTokens) {
    for (const t of new Set(toks)) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const N = cleared.length;
  function idf(t: string): number {
    const df = docFreq.get(t) ?? 0;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  const scored = cleared.map<ScoredChunk>((c, i) => {
    const toks = docTokens[i] ?? [];
    const len = docLengths[i] ?? 0;
    if (len === 0) return { ...c, _score: 0 };
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const qt of queryTokens) {
      const f = tf.get(qt) ?? 0;
      if (f === 0) continue;
      const numer = f * (BM25_K1 + 1);
      const denom = f + BM25_K1 * (1 - BM25_B + BM25_B * (len / Math.max(1, avgDocLen)));
      score += idf(qt) * (numer / denom);
    }
    return { ...c, _score: score };
  });

  return scored
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, args.k);
}

/**
 * Combine vector + BM25 top-K via Reciprocal Rank Fusion.
 * Returns chunks deduped by id, ordered by fused score.
 *
 * Fused _score is the sum of 1/(k+rank) across rankers — not directly
 * comparable to the original cosine/BM25 scales. Downstream rerankers
 * should treat it as ordinal only.
 */
export function hybridTopK(args: {
  query: string;
  queryEmbedding: number[];
  k: number;
  userClearance: Classification;
  filter?: { iso3?: string; lang?: "en" | "ar"; source?: string };
}): ScoredChunk[] {
  const vectorHits = vectorTopK({
    queryEmbedding: args.queryEmbedding,
    k: args.k,
    userClearance: args.userClearance,
    filter: args.filter,
  });
  const bm25Hits = bm25TopK({
    query: args.query,
    k: args.k,
    userClearance: args.userClearance,
    filter: args.filter,
  });

  // RRF: sum 1/(k+rank) per id across both lists.
  const fused = new Map<string, { chunk: ScoredChunk; score: number }>();
  vectorHits.forEach((c, i) => {
    fused.set(c.id, { chunk: c, score: 1 / (RRF_K + (i + 1)) });
  });
  bm25Hits.forEach((c, i) => {
    const prev = fused.get(c.id);
    const contribution = 1 / (RRF_K + (i + 1));
    if (prev) prev.score += contribution;
    else fused.set(c.id, { chunk: c, score: contribution });
  });

  return Array.from(fused.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, args.k)
    .map(({ chunk, score }) => ({ ...chunk, _score: score }));
}
