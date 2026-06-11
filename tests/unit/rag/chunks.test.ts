import { beforeEach, describe, expect, it, vi } from "vitest";

let upsertChunk: typeof import("@/services/rag/chunks").upsertChunk;
let topK: typeof import("@/services/rag/chunks").topK;
let filterChunksByClearance: typeof import("@/services/rag/chunks").filterChunksByClearance;
let cosine: typeof import("@/services/rag/chunks").cosine;
let listChunks: typeof import("@/services/rag/chunks").listChunks;

beforeEach(async () => {
  vi.resetModules();
  (globalThis as Record<string, unknown>).__ciRagChunks = [];
  const mod = await import("@/services/rag/chunks");
  upsertChunk = mod.upsertChunk;
  topK = mod.topK;
  filterChunksByClearance = mod.filterChunksByClearance;
  cosine = mod.cosine;
  listChunks = mod.listChunks;
});

describe("cosine", () => {
  it("identical vectors → 1", () => expect(cosine([1, 0], [1, 0])).toBeCloseTo(1));
  it("orthogonal → 0", () => expect(cosine([1, 0], [0, 1])).toBe(0));
  it("empty → 0", () => expect(cosine([], [])).toBe(0));
});

describe("filterChunksByClearance", () => {
  it("drops chunks above user clearance", () => {
    const ch = [
      { id: "a", classification: "public" as const },
      { id: "b", classification: "confidential" as const },
      { id: "c", classification: "secret" as const },
    ];
    // Cast to Chunk[]; minimal fields ok for filter
    const r = filterChunksByClearance(ch as never, "internal");
    expect(r.map((c) => c.id)).toEqual(["a"]);
  });
});

describe("topK", () => {
  it("returns top scored matches", () => {
    upsertChunk({
      id: "doc:1",
      docId: "doc:1",
      text: "x",
      source: "world_bank",
      classification: "public",
      embedding: [1, 0, 0],
      addedAt: "",
      addedBy: "test",
    });
    upsertChunk({
      id: "doc:2",
      docId: "doc:2",
      text: "y",
      source: "world_bank",
      classification: "public",
      embedding: [0, 1, 0],
      addedAt: "",
      addedBy: "test",
    });
    upsertChunk({
      id: "doc:3",
      docId: "doc:3",
      text: "z",
      source: "world_bank",
      classification: "public",
      embedding: [0.9, 0.1, 0],
      addedAt: "",
      addedBy: "test",
    });
    const out = topK({
      queryEmbedding: [1, 0, 0],
      k: 2,
      userClearance: "internal",
    });
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe("doc:1");
    expect(out[1]?.id).toBe("doc:3");
  });

  it("filters by iso3", () => {
    upsertChunk({
      id: "x",
      docId: "x",
      text: "x",
      source: "wb",
      iso3: "SAU",
      classification: "public",
      embedding: [1, 0],
      addedAt: "",
      addedBy: "t",
    });
    upsertChunk({
      id: "y",
      docId: "y",
      text: "y",
      source: "wb",
      iso3: "ARE",
      classification: "public",
      embedding: [1, 0],
      addedAt: "",
      addedBy: "t",
    });
    const out = topK({
      queryEmbedding: [1, 0],
      k: 5,
      userClearance: "internal",
      filter: { iso3: "SAU" },
    });
    expect(out.map((c) => c.id)).toEqual(["x"]);
  });

  it("clearance filter blocks above-tier chunks", () => {
    upsertChunk({
      id: "pub",
      docId: "pub",
      text: "x",
      source: "wb",
      classification: "public",
      embedding: [1, 0],
      addedAt: "",
      addedBy: "t",
    });
    upsertChunk({
      id: "sec",
      docId: "sec",
      text: "x",
      source: "wb",
      classification: "secret",
      embedding: [1, 0],
      addedAt: "",
      addedBy: "t",
    });
    const out = topK({ queryEmbedding: [1, 0], k: 5, userClearance: "internal" });
    expect(out.map((c) => c.id)).toEqual(["pub"]);
  });

  it("skips chunks without embeddings", () => {
    upsertChunk({
      id: "noemb",
      docId: "noemb",
      text: "x",
      source: "wb",
      classification: "public",
      addedAt: "",
      addedBy: "t",
    });
    expect(topK({ queryEmbedding: [1, 0], k: 5, userClearance: "internal" })).toEqual([]);
  });

  it("listChunks returns all when no filter", () => {
    upsertChunk({
      id: "a",
      docId: "a",
      text: "x",
      source: "wb",
      classification: "public",
      addedAt: "",
      addedBy: "t",
    });
    upsertChunk({
      id: "b",
      docId: "b",
      text: "x",
      source: "wb",
      classification: "public",
      addedAt: "",
      addedBy: "t",
    });
    expect(listChunks()).toHaveLength(2);
  });
});
