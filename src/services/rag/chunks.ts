import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Classification } from "@/types";

export interface Chunk {
  id: string; // e.g. "doc:412:3"
  docId: string; // "doc:412"
  text: string;
  source: string; // "world_bank" | "imf" | ...
  iso3?: string;
  lang?: "en" | "ar";
  classification: Classification; // floor: "public"
  embedding?: number[]; // populated by embed step
  embedModel?: string; // model id used (cache invalidation key)
  addedAt: string;
  addedBy: string;
}

const STORE_PATH = path.join(process.cwd(), "data", "rag-chunks.json");

declare global {
  // eslint-disable-next-line no-var
  var __ciRagChunks: Chunk[] | undefined;
}

function loadFromDisk(): Chunk[] {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { chunks?: Chunk[] };
    if (Array.isArray(parsed.chunks)) return parsed.chunks;
  } catch {
    // miss
  }
  return [];
}

let cache: Chunk[] = globalThis.__ciRagChunks ?? loadFromDisk();
if (!globalThis.__ciRagChunks) globalThis.__ciRagChunks = cache;

// O(1) id → cache-index lookup. Rebuilt eagerly on every mutation.
// Kept in sync alongside cache so getChunk doesn't scan O(N) per call.
let idIndex: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (let i = 0; i < cache.length; i++) m.set(cache[i]!.id, i);
  return m;
})();

function rebuildIndex(): void {
  idIndex = new Map<string, number>();
  for (let i = 0; i < cache.length; i++) idIndex.set(cache[i]!.id, i);
}

function persist(): void {
  globalThis.__ciRagChunks = cache;
  // Never write the on-disk store during tests — vitest's chunk tests would
  // otherwise clobber the committed seed corpus (data/rag-chunks.json).
  if (process.env.VITEST) return;
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify({ chunks: cache }, null, 2), "utf-8");
  } catch (err) {
    console.error("[rag.chunks] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function listChunks(filter?: {
  iso3?: string;
  lang?: "en" | "ar";
  source?: string;
}): Chunk[] {
  let out = cache;
  if (filter?.iso3) out = out.filter((c) => c.iso3 === filter.iso3);
  if (filter?.lang) out = out.filter((c) => !c.lang || c.lang === filter.lang);
  if (filter?.source) out = out.filter((c) => c.source === filter.source);
  return out;
}

export function getChunk(id: string): Chunk | undefined {
  const idx = idIndex.get(id);
  return idx !== undefined ? cache[idx] : undefined;
}

export function upsertChunk(c: Chunk): Chunk {
  const idx = idIndex.get(c.id);
  if (idx !== undefined) {
    cache[idx] = c;
  } else {
    idIndex.set(c.id, cache.length);
    cache.push(c);
  }
  persist();
  return c;
}

export function upsertChunks(chunks: Chunk[]): number {
  for (const c of chunks) {
    const idx = idIndex.get(c.id);
    if (idx !== undefined) {
      cache[idx] = c;
    } else {
      idIndex.set(c.id, cache.length);
      cache.push(c);
    }
  }
  persist();
  return chunks.length;
}

export function deleteChunk(id: string): boolean {
  if (!idIndex.has(id)) return false;
  cache = cache.filter((c) => c.id !== id);
  rebuildIndex();
  persist();
  return true;
}

export function chunkCount(): number {
  return cache.length;
}

/**
 * Filter chunks the requesting user is allowed to see based on classification.
 * Floor: chunk.classification must be ≤ user's clearance.
 */
export function filterChunksByClearance(chunks: Chunk[], userClearance: Classification): Chunk[] {
  const rank: Record<Classification, number> = {
    public: 0,
    internal: 1,
    confidential: 2,
    secret: 3,
  };
  const ceiling = rank[userClearance];
  return chunks.filter((c) => rank[c.classification] <= ceiling);
}

/** Cosine similarity between two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * In-memory top-K by cosine, filtered + cleared.
 * Returns chunks with `_score` attached (does not mutate cache).
 */
export interface ScoredChunk extends Chunk {
  _score: number;
}

export function topK(args: {
  queryEmbedding: number[];
  k: number;
  userClearance: Classification;
  filter?: { iso3?: string; lang?: "en" | "ar"; source?: string };
}): ScoredChunk[] {
  // First try strict lang match; if empty, fall back to lang-agnostic so cross-lang
  // questions still retrieve (e.g. Arabic query against English-only corpus).
  let filtered = listChunks(args.filter);
  if (filtered.length === 0 && args.filter?.lang) {
    const fallback = { ...args.filter };
    fallback.lang = undefined;
    filtered = listChunks(fallback);
  }
  const cleared = filterChunksByClearance(filtered, args.userClearance);
  const scored = cleared
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map<ScoredChunk>((c) => {
      const base = cosine(args.queryEmbedding, c.embedding!);
      // Soft lang preference: 5% boost when chunk lang matches request lang.
      const langBoost = args.filter?.lang && c.lang === args.filter.lang ? 1.05 : 1;
      return { ...c, _score: base * langBoost };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, args.k);
  return scored;
}
