import { getCurrentUser } from "@/lib/auth/server";
import type { AgentState } from "@/services/agent/state";
import { videoSceneSvgs } from "@/services/export/video-scenes";
import { renderVideoBrief } from "@/services/video/render";
import { Resvg } from "@resvg/resvg-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Render a short on-prem video brief (frames + macOS TTS + ffmpeg) from the
 *  agent state produced on /agent. Auth-gated. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { state?: AgentState };
  try {
    body = (await req.json()) as { state?: AgentState };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const state = body.state;
  if (!state?.scope?.iso3) {
    return NextResponse.json({ error: "missing state.scope" }, { status: 400 });
  }

  try {
    const scenes = videoSceneSvgs(state).map((s) => ({
      png: Buffer.from(
        new Resvg(s.svg, {
          fitTo: { mode: "width", value: 1280 },
          font: { loadSystemFonts: true },
        })
          .render()
          .asPng(),
      ),
      narration: s.narration,
    }));
    const mp4 = await renderVideoBrief(scenes);
    return new Response(new Uint8Array(mp4), {
      headers: {
        "content-type": "video/mp4",
        "content-disposition": 'inline; filename="country-brief.mp4"',
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "video render failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
