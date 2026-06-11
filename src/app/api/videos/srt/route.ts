import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import type { VideoVariant } from "@/services/video/script";
import { renderSrt } from "@/services/video/srt";
import type { Classification } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SceneSchema = z.object({
  index: z.number().int(),
  startSec: z.number(),
  endSec: z.number(),
  visual: z.string(),
  onScreenText: z.string(),
  narration: z.string(),
  source: z.string().optional(),
});

const VariantSchema = z.object({
  id: z.string(),
  style: z.enum(["executive", "documentary", "data-narrative", "diplomatic"]),
  title: z.string().max(140),
  hook: z.string().max(400),
  scenes: z.array(SceneSchema).min(1).max(40),
  citations: z.array(z.string()).default([]),
  classification: z.enum(["public", "internal", "confidential", "secret"]),
  confidence: z.enum(["high", "med", "low"]),
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
  const parsed = VariantSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const variant = parsed.data as VideoVariant;
  const cls = variant.classification as Classification;
  if (CLEARANCE_RANK[cls] > CLEARANCE_RANK[user.clearance as Classification]) {
    return NextResponse.json(
      { error: `insufficient clearance: required ${cls}, have ${user.clearance}` },
      { status: 403 },
    );
  }

  const srt = renderSrt(variant);
  const slug = variant.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  logAudit(user, "video.srt.ok", "video", {
    resourceId: variant.id,
    classification: cls,
    meta: { scenes: variant.scenes.length },
  });
  return new NextResponse(srt, {
    status: 200,
    headers: {
      "content-type": "application/x-subrip; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.srt"`,
      "x-classification": cls,
    },
  });
}
