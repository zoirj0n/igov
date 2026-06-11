import { readFile } from "node:fs/promises";
import path from "node:path";
import { findSourceByCacheKey } from "@/lib/sources/manifest";
import { embed } from "@/services/llm/embed";
import type { Classification } from "@/types";
import { chunkText } from "./chunker";
import { type Chunk, upsertChunks } from "./chunks";

export interface IngestTextInput {
  docId: string; // stable id e.g. "doc:user-upload:<slug>"
  text: string;
  source: string; // free string for citation ("world_bank", "imf", "user-upload:xyz")
  classification: Classification;
  iso3?: string;
  lang?: "en" | "ar";
  addedBy: string;
}

export interface IngestResult {
  docId: string;
  chunks: number;
  embedded: number;
  /** Chunks dropped because the embed provider returned no vector for them. */
  skipped?: number;
  durationMs: number;
  embedVendor: string;
  embedModel: string;
}

export async function ingestText(input: IngestTextInput): Promise<IngestResult> {
  const t0 = Date.now();
  const pieces = chunkText(input.text, { targetTokens: 500, overlapTokens: 50 });
  if (pieces.length === 0) {
    return {
      docId: input.docId,
      chunks: 0,
      embedded: 0,
      durationMs: Date.now() - t0,
      embedVendor: "skipped",
      embedModel: "skipped",
    };
  }

  // Embed all pieces in a single call.
  const embedRes = await embed({
    texts: pieces.map((p) => p.text),
    classification: input.classification,
  });

  const now = new Date().toISOString();
  // Drop chunks whose embedding vector came back missing/empty — they would
  // be persisted but invisible to vector retrieval (chunks.ts filters out
  // empty embeddings before cosine). Surface the count so callers can warn.
  const chunks: Chunk[] = [];
  let missingEmbeddings = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const vec = embedRes.vectors[i];
    if (!vec || vec.length === 0) {
      missingEmbeddings += 1;
      continue;
    }
    chunks.push({
      id: `${input.docId}:${i}`,
      docId: input.docId,
      text: piece.text,
      source: input.source,
      classification: input.classification,
      iso3: input.iso3,
      lang: input.lang,
      embedding: vec,
      embedModel: embedRes.model,
      addedAt: now,
      addedBy: input.addedBy,
    });
  }
  const count = upsertChunks(chunks);
  if (missingEmbeddings > 0) {
    console.warn(
      `[rag.ingest] ${input.docId}: ${missingEmbeddings}/${pieces.length} chunks skipped (no embedding from vendor=${embedRes.vendor})`,
    );
  }

  return {
    docId: input.docId,
    chunks: chunks.length,
    embedded: count,
    skipped: missingEmbeddings,
    durationMs: Date.now() - t0,
    embedVendor: embedRes.vendor,
    embedModel: embedRes.model,
  };
}

/**
 * Ingest a previously uploaded source by cacheKey (resolves via existing manifest).
 * Only `local://` sources can be ingested — http sources need the import pipeline first.
 */
export async function ingestSourceByKey(args: {
  cacheKey: string;
  classification: Classification;
  iso3?: string;
  lang?: "en" | "ar";
  addedBy: string;
}): Promise<IngestResult> {
  const hit = findSourceByCacheKey(args.cacheKey);
  if (!hit) throw new Error(`source not found: ${args.cacheKey}`);
  const { source } = hit;
  if (!source.url.startsWith("local://")) {
    throw new Error(`only local:// sources supported; got ${source.url}`);
  }
  const rel = source.url.slice("local://".length);
  const localPath = path.join(process.cwd(), "agent-resources", rel);
  const raw = await readFile(localPath, "utf-8");
  return ingestText({
    docId: `doc:source:${args.cacheKey}`,
    text: raw,
    source: source.name,
    classification: args.classification,
    iso3: args.iso3,
    lang: args.lang,
    addedBy: args.addedBy,
  });
}
