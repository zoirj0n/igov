import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import { DeckSchema } from "@/services/export/deck-schema";
import { FfmpegMissingError, renderDeckVideoMp4 } from "@/services/export/deck-video";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const BodySchema = z.object({ deck: DeckSchema });

/** Animated MP4 brief from the structured deck (same payload as the PPTX
 *  export) — keyframed text highlights, Ken Burns zoom, crossfades. Fully
 *  on-prem: resvg + ffmpeg, no cloud calls. Auth-gated. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  try {
    const mp4 = await renderDeckVideoMp4(parsed.data.deck);
    logAudit(user, "export.video.ok", "country", {
      resourceId: parsed.data.deck.iso3,
      meta: { bytes: mp4.length, locale: parsed.data.deck.locale ?? "en" },
    });
    return new Response(new Uint8Array(mp4), {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": 'attachment; filename="country-brief.mp4"',
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof FfmpegMissingError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    const message = err instanceof Error ? err.message : "video render failed";
    logAudit(user, "export.video.error", "country", {
      resourceId: parsed.data.deck.iso3,
      meta: { error: message.slice(0, 200) },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
