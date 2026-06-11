import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { ingestSourceByKey, ingestText } from "@/services/rag/ingest";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ClassEnum = z.enum(["public", "internal", "confidential", "secret"]);
const LangEnum = z.enum(["en", "ar"]).optional();

const BodySchema = z.union([
  z.object({
    kind: z.literal("text"),
    docId: z.string().min(1).max(120),
    text: z.string().min(20).max(5_000_000),
    source: z.string().min(1).max(80),
    classification: ClassEnum,
    iso3: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    lang: LangEnum,
  }),
  z.object({
    kind: z.literal("source"),
    cacheKey: z.string().min(1).max(80),
    classification: ClassEnum,
    iso3: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    lang: LangEnum,
  }),
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }

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

  try {
    const result =
      parsed.data.kind === "text"
        ? await ingestText({
            docId: parsed.data.docId,
            text: parsed.data.text,
            source: parsed.data.source,
            classification: parsed.data.classification,
            iso3: parsed.data.iso3,
            lang: parsed.data.lang,
            addedBy: user.email,
          })
        : await ingestSourceByKey({
            cacheKey: parsed.data.cacheKey,
            classification: parsed.data.classification,
            iso3: parsed.data.iso3,
            lang: parsed.data.lang,
            addedBy: user.email,
          });
    logAudit(user, "rag.ingest.ok", "rag", {
      resourceId: result.docId,
      classification: parsed.data.classification,
      meta: {
        chunks: result.chunks,
        embedded: result.embedded,
        durationMs: result.durationMs,
        embedVendor: result.embedVendor,
        embedModel: result.embedModel,
        kind: parsed.data.kind,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ingest failed";
    logAudit(user, "rag.ingest.error", "rag", {
      meta: { error: msg, kind: parsed.data.kind },
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
