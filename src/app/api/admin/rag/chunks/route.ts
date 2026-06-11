import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { chunkCount, listChunks } from "@/services/rag/chunks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const url = new URL(req.url);
  const iso3 = url.searchParams.get("iso3") ?? undefined;
  const all = listChunks(iso3 ? { iso3 } : undefined);
  // Strip embeddings from list response — too heavy
  const summary = all
    .slice(-100)
    .reverse()
    .map((c) => ({
      id: c.id,
      docId: c.docId,
      source: c.source,
      iso3: c.iso3,
      lang: c.lang,
      classification: c.classification,
      addedAt: c.addedAt,
      addedBy: c.addedBy,
      embedModel: c.embedModel,
      preview: c.text.slice(0, 140),
      chars: c.text.length,
      embeddingDims: c.embedding?.length ?? 0,
    }));
  return NextResponse.json({
    total: chunkCount(),
    chunks: summary,
  });
}
