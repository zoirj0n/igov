/**
 * Text embedding provider abstraction.
 * Mirrors the chat-provider design: cloud + local options gated by classification.
 *
 * Providers:
 *   - voyage   (cloud · voyage-multilingual-2 · 1024-dim)
 *   - openai   (cloud · text-embedding-3-small)
 *   - local    (on-prem · Ollama embeddings model, e.g. bge-m3:567m)
 */

import type { Classification } from "@/types";
import { logLlmCall } from "./call-log";
import { type ProviderName, isCloud, resolveProvider } from "./config";

export interface EmbedRequest {
  texts: string[];
  classification: Classification;
}

export type EmbedVendor = "voyage" | "openai" | "local" | "mock";

export interface EmbedResult {
  vectors: number[][];
  model: string;
  vendor: EmbedVendor;
  /** Resolved provider tier (cloud/local) used for the routing decision. */
  providerTier: ProviderName;
  usedRealApi: boolean;
}

export class EmbedCloudClassError extends Error {
  constructor(
    public classification: Classification,
    public provider: ProviderName,
  ) {
    super(
      `embeddings for classification "${classification}" cannot use cloud provider "${provider}"`,
    );
    this.name = "EmbedCloudClassError";
  }
}

const VOYAGE_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL ?? "voyage-multilingual-2";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "bge-m3";

function gate(classification: Classification, provider: ProviderName): void {
  if (isCloud(provider) && (classification === "confidential" || classification === "secret")) {
    throw new EmbedCloudClassError(classification, provider);
  }
}

async function voyageEmbed(req: EmbedRequest, tier: ProviderName): Promise<EmbedResult> {
  if (!VOYAGE_KEY) {
    return mockEmbed(req, "voyage", VOYAGE_MODEL, tier, "VOYAGE_API_KEY not set");
  }
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${VOYAGE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: req.texts,
      model: VOYAGE_MODEL,
      input_type: "document",
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`voyage ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vectors = (data.data ?? []).map((d) => d.embedding ?? []);
  return { vectors, model: VOYAGE_MODEL, vendor: "voyage", providerTier: tier, usedRealApi: true };
}

async function ollamaEmbed(req: EmbedRequest): Promise<EmbedResult> {
  try {
    const ping = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(800) });
    if (!ping.ok)
      return mockEmbed(
        req,
        "local",
        OLLAMA_EMBED_MODEL,
        "local",
        `ollama unreachable at ${OLLAMA_URL}`,
      );
  } catch {
    return mockEmbed(
      req,
      "local",
      OLLAMA_EMBED_MODEL,
      "local",
      `ollama unreachable at ${OLLAMA_URL}`,
    );
  }
  const vectors: number[][] = [];
  for (const text of req.texts) {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`ollama embed ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = (await res.json()) as { embedding?: number[] };
    vectors.push(data.embedding ?? []);
  }
  return {
    vectors,
    model: OLLAMA_EMBED_MODEL,
    vendor: "local",
    providerTier: "local",
    usedRealApi: true,
  };
}

/**
 * Token-hash embedding fallback for when no real vendor is reachable.
 *
 * Previously this produced a 32-dim sinusoidal char-code hash — visually
 * "embedding-shaped" but semantically meaningless. Two documents about
 * "renewables" and "wind power" hashed to unrelated positions, killing
 * retrieval recall.
 *
 * New approach: 256-dim hashed bag-of-words with sub-linear term frequency
 * dampening (1 + log(tf)) and L2 normalization. Documents sharing tokens
 * land in overlapping subspaces, so cosine similarity tracks lexical overlap.
 * Still not real semantic embeddings — but enough to give the retriever
 * meaningful ranking signal in offline / dev environments.
 */
const MOCK_DIM = 256;
// Unicode-aware tokenizer: \p{L} = any letter (Latin, Arabic, CJK, etc),
// \p{N} = any number. Prior /[a-z0-9]+/i stripped Arabic queries to zero
// tokens, killing recall on Arabic-language goldens (q10).
const TOKEN_RE = /[\p{L}\p{N}]+/gu;
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

function hashTokenToDim(token: string): number {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % MOCK_DIM;
}

function mockEmbed(
  req: EmbedRequest,
  vendor: EmbedVendor,
  model: string,
  tier: ProviderName,
  reason: string,
): EmbedResult {
  const vectors = req.texts.map((text) => {
    const v = new Array(MOCK_DIM).fill(0) as number[];
    const counts = new Map<string, number>();
    // Match against ORIGINAL text (not lowercased) since Arabic has no case
    // and /u flag handles letter detection across scripts.
    const tokens = text.match(TOKEN_RE) ?? [];
    for (const raw of tokens) {
      const tok = raw.toLowerCase();
      if (tok.length < 2 || STOPWORDS.has(tok)) continue;
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
    for (const [tok, tf] of counts) {
      const dim = hashTokenToDim(tok);
      // Sub-linear dampening so common words don't dominate.
      const weight = 1 + Math.log(tf);
      v[dim] = (v[dim] ?? 0) + weight;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  });
  console.warn(`[embed] mock vendor=${vendor} (${reason})`);
  return {
    vectors,
    model: `mock:${model}`,
    vendor: "mock",
    providerTier: tier,
    usedRealApi: false,
  };
}

export async function embed(
  req: EmbedRequest & { actor?: string; reqId?: string; sessionId?: string },
): Promise<EmbedResult> {
  const target = resolveProvider(req.classification);
  gate(req.classification, target);
  // Offline mode: block cloud embed providers (voyage, openai) when admin
  // has flipped offline=true. Local Ollama embeddings still allowed.
  const { enforceOfflineGate } = await import("./config");
  enforceOfflineGate(target);
  const t0 = Date.now();
  const promptChars = req.texts.reduce((s, t) => s + t.length, 0);
  let result: EmbedResult;
  let errorClass: string | undefined;
  try {
    result = target === "local" ? await ollamaEmbed(req) : await voyageEmbed(req, target);
  } catch (err) {
    // Real API errors (4xx quota, 5xx, network) shouldn't crash the RAG
    // pipeline. Log the error class for telemetry, then degrade to the mock
    // embed so retrieval still runs (with reduced semantic quality). The
    // RagResult carries embedVendor="mock", so callers can warn the user.
    errorClass = err instanceof Error ? err.name : "Error";
    const reason = `${target}_api_error: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`;
    logLlmCall({
      actor: req.actor ?? "system",
      reqId: req.reqId,
      sessionId: req.sessionId,
      step: "embed",
      provider: target,
      model: target === "local" ? OLLAMA_EMBED_MODEL : VOYAGE_MODEL,
      classification: req.classification,
      promptChars,
      completionChars: 0,
      durationMs: Date.now() - t0,
      // Real attempt failed; this log entry represents the failed call, not
      // the mock that followed. We flip usedRealApi:false so cost/usage
      // aggregations don't count it as a successful real-API call.
      usedRealApi: false,
      errorClass,
    });
    result = mockEmbed(
      req,
      target === "local" ? "local" : "voyage",
      target === "local" ? OLLAMA_EMBED_MODEL : VOYAGE_MODEL,
      target,
      reason,
    );
  }
  logLlmCall({
    actor: req.actor ?? "system",
    reqId: req.reqId,
    sessionId: req.sessionId,
    step: "embed",
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
