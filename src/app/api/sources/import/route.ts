import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { importSource } from "@/services/import/import";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  cacheKey: z.string().min(1).max(80),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  logAudit(user, "source.import.start", "source", {
    resourceId: parsed.data.cacheKey,
    meta: { force: Boolean(parsed.data.force) },
  });

  try {
    const result = await importSource(parsed.data.cacheKey, parsed.data.force, user.email);
    const ingest = result.ingest;
    const rows = ingest && "rowsUpserted" in ingest ? ingest.rowsUpserted : 0;
    const errArr =
      ingest && "errors" in ingest && Array.isArray(ingest.errors) ? ingest.errors : [];
    const skipped = Boolean(ingest && "skipped" in ingest && ingest.skipped);
    logAudit(user, "source.import.ok", "source", {
      resourceId: parsed.data.cacheKey,
      meta: {
        runner: result.classification.runner ?? "none",
        confidence: result.classification.confidence,
        bytes: result.bytes,
        fetched: result.fetched,
        rowsUpserted: rows,
        errors: errArr.length,
        skipped,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "import failed";
    logAudit(user, "source.import.error", "source", {
      resourceId: parsed.data.cacheKey,
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
