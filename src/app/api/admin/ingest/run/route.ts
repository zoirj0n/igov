import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { runByKey } from "@/services/ingest/runner";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  source: z.enum(["worldbank", "imf", "ember", "oecd"]).default("worldbank"),
  force: z.boolean().optional(),
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

  const force = parsed.data.force ?? true;
  logAudit(user, "ingest.start", "ingest", { resourceId: parsed.data.source, meta: { force } });

  try {
    const stats = await runByKey(parsed.data.source, force);
    logAudit(user, "ingest.ok", "ingest", {
      resourceId: parsed.data.source,
      meta: { rows: stats.rowsUpserted, ms: stats.durationMs, errors: stats.errors.length, force },
    });
    return NextResponse.json(stats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    logAudit(user, "ingest.error", "ingest", {
      resourceId: parsed.data.source,
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
