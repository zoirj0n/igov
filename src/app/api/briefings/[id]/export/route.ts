import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { COUNTRIES } from "@/lib/data/countries";
import { logAudit } from "@/services/audit";
import { renderBriefingPdf, renderBriefingPptx } from "@/services/export";
import { findBriefing } from "@/services/repo/briefings";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = (new URL(req.url).searchParams.get("format") ?? "pdf").toLowerCase();
  if (format !== "pdf" && format !== "pptx") {
    return NextResponse.json({ error: "format must be pdf or pptx" }, { status: 400 });
  }

  const briefing = await findBriefing(id);
  if (!briefing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canRead(user, briefing.classification)) {
    logAudit(user, `briefing.export.${format}.denied`, "briefing", {
      resourceId: briefing.id,
      classification: briefing.classification,
      meta: { reason: "insufficient clearance" },
    });
    return NextResponse.json(
      {
        error: `insufficient clearance: required ${briefing.classification}, have ${user.clearance}`,
      },
      { status: 403 },
    );
  }

  const country = COUNTRIES.find((c) => c.iso3 === briefing.countryIso3);

  try {
    const slug = briefing.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60);
    if (format === "pdf") {
      const buf = await renderBriefingPdf(briefing, country);
      logAudit(user, "briefing.export.pdf.ok", "briefing", {
        resourceId: briefing.id,
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
    const buf = await renderBriefingPptx(briefing, country);
    logAudit(user, "briefing.export.pptx.ok", "briefing", {
      resourceId: briefing.id,
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
      resourceId: briefing.id,
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
