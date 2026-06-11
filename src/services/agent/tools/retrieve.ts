/**
 * Retrieval tool — embeds the query and runs the existing hybrid (vector ∪ BM25,
 * RRF-fused) retriever over the RAG corpus. Degrades to BM25-only if embedding
 * fails (e.g. embed model unreachable), so it never throws the run.
 */
import type { Passage } from "@/services/agent/state";
import { embed } from "@/services/llm/embed";
import { hybridTopK } from "@/services/rag/hybrid";
import type { Classification } from "@/types";

export interface RetrieveOpts {
  k?: number;
  iso3?: string;
  clearance?: Classification;
}

export async function retrievePassages(query: string, opts: RetrieveOpts = {}): Promise<Passage[]> {
  const k = opts.k ?? 6;
  const clearance = opts.clearance ?? "internal";

  let queryEmbedding: number[] = [];
  try {
    const e = await embed({ texts: [query], classification: clearance, actor: "agent" });
    queryEmbedding = e.vectors[0] ?? [];
  } catch {
    queryEmbedding = []; // hybrid falls through to BM25-only
  }

  const hits = hybridTopK({
    query,
    queryEmbedding,
    k,
    userClearance: clearance,
    filter: opts.iso3 ? { iso3: opts.iso3.toUpperCase() } : undefined,
  });

  return hits.map((h) => ({ id: h.id, text: h.text, source: h.source }));
}
