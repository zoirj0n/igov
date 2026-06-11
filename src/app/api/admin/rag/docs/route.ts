import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { listChunks } from "@/services/rag/chunks";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocSummary {
  docId: string;
  source: string;
  iso3?: string;
  lang?: "en" | "ar";
  classification: string;
  chunkCount: number;
  totalChars: number;
  lastIngestedAt: string;
  lastIngestedBy: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }

  const all = listChunks();
  const byDoc = new Map<string, DocSummary>();
  for (const c of all) {
    const existing = byDoc.get(c.docId);
    if (!existing) {
      byDoc.set(c.docId, {
        docId: c.docId,
        source: c.source,
        iso3: c.iso3,
        lang: c.lang,
        classification: c.classification,
        chunkCount: 1,
        totalChars: c.text.length,
        lastIngestedAt: c.addedAt,
        lastIngestedBy: c.addedBy,
      });
    } else {
      existing.chunkCount += 1;
      existing.totalChars += c.text.length;
      if (c.addedAt > existing.lastIngestedAt) {
        existing.lastIngestedAt = c.addedAt;
        existing.lastIngestedBy = c.addedBy;
      }
    }
  }
  const docs = Array.from(byDoc.values()).sort((a, b) =>
    b.lastIngestedAt.localeCompare(a.lastIngestedAt),
  );
  return NextResponse.json({ docs });
}
