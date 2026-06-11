import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { importAll } from "@/services/import/import";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  force: z.boolean().optional(),
  max: z.number().int().min(1).max(90).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    // empty body ok
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  logAudit(user, "import.auto.start", "import", { meta: parsed.data });

  const t0 = Date.now();
  const results = await importAll({ ...parsed.data, actor: user.email });
  const ok = results.filter((r) => r.classification.runner !== null).length;
  const totalRows = results.reduce(
    (n, r) => n + (r.ingest && "rowsUpserted" in r.ingest ? r.ingest.rowsUpserted : 0),
    0,
  );

  logAudit(user, "import.auto.ok", "import", {
    meta: {
      sources: results.length,
      classified: ok,
      rowsUpserted: totalRows,
      ms: Date.now() - t0,
    },
  });

  return NextResponse.json({
    sources: results.length,
    classified: ok,
    rowsUpserted: totalRows,
    ms: Date.now() - t0,
    results: results.map((r) => ({
      cacheKey: r.cacheKey,
      category: r.category,
      source: r.source.name,
      runner: r.classification.runner,
      confidence: r.classification.confidence,
      reason: r.classification.reason,
      bytes: r.bytes,
      fetched: r.fetched,
    })),
  });
}
