import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { COUNTRIES } from "@/lib/data/countries";
import { logAudit } from "@/services/audit";
import { renderBriefingPdf, renderBriefingPptx } from "@/services/export";
import type { Briefing } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  format: z.enum(["pdf", "pptx"]).default("pptx"),
  // Deck chrome language (PDF stays EN-labelled: @react-pdf Arabic shaping is unreliable).
  lang: z.enum(["en", "ar"]).default("en"),
  briefing: z.object({
    title: z.string().min(1).max(300),
    countryIso3: z.string().length(3),
    audience: z.string().max(120).default("Leadership"),
    classification: z.enum(["public", "internal", "confidential", "secret"]),
    body: z.string().min(1).max(20_000),
    talkingPoints: z.array(z.string().max(500)).max(20).optional(),
    risks: z.array(z.string().max(500)).max(20).optional(),
    opportunities: z.array(z.string().max(500)).max(20).optional(),
    citations: z.array(z.string().max(300)).max(40).optional(),
    confidence: z.enum(["high", "med", "low"]).optional(),
  }),
});

/** Export a live (unsaved) briefing — e.g. straight from the strategic-advisor
 *  agent — as the full structured deck/document, same renderer, classification
 *  stamping, and ABAC gate as stored-briefing export. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  const { format, lang, briefing: input } = parsed.data;
  const countryIso3 = input.countryIso3.toUpperCase();
  const resourceId = `live:${countryIso3}`;

  if (!canRead(user, input.classification)) {
    logAudit(user, `briefing.export.${format}.denied`, "briefing", {
      resourceId,
      classification: input.classification,
      meta: { reason: "insufficient clearance" },
    });
    return NextResponse.json(
      {
        error: `insufficient clearance: required ${input.classification}, have ${user.clearance}`,
      },
      { status: 403 },
    );
  }

  const briefing: Briefing = {
    ...input,
    countryIso3,
    id: resourceId,
    createdBy: user.name,
    createdAt: new Date().toISOString(),
  };
  const country = COUNTRIES.find((c) => c.iso3 === countryIso3);

  try {
    const slug =
      briefing.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) || `country-brief-${countryIso3.toLowerCase()}`;
    if (format === "pdf") {
      const buf = await renderBriefingPdf(briefing, country);
      logAudit(user, "briefing.export.pdf.ok", "briefing", {
        resourceId,
        classification: briefing.classification,
        meta: { bytes: buf.length },
      });
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${slug}.pdf"`,
          "x-classification": briefing.classification,
          "cache-control": "no-store",
        },
      });
    }
    const buf = await renderBriefingPptx(briefing, country, lang);
    logAudit(user, "briefing.export.pptx.ok", "briefing", {
      resourceId,
      classification: briefing.classification,
      meta: { bytes: buf.length },
    });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": `attachment; filename="${slug}.pptx"`,
        "x-classification": briefing.classification,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "render failed";
    logAudit(user, `briefing.export.${format}.error`, "briefing", {
      resourceId,
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
