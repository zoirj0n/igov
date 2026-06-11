import { getCurrentUser } from "@/lib/auth/server";
import { type AgentDeckPayload, renderAgentDeckPptx } from "@/services/export/agent-deck";
import { DeckSchema } from "@/services/export/deck-schema";
import { Resvg } from "@resvg/resvg-js";
import { NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  svg: z.string().min(20).max(300_000),
  format: z.enum(["png", "pptx"]).default("png"),
  title: z.string().max(200).optional(),
  talkingPoints: z.array(z.string().max(400)).max(12).optional(),
  /** Full structured deck (agent state). When present, PPTX gets the
   *  multi-slide executive deck instead of the legacy 2-slide export. */
  deck: DeckSchema.optional(),
});

function rasterize(svg: string, width: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}

/** Export a one-pager (built client-side from agent state) as a high-res PNG or
 *  a ready-to-present PPTX (infographic slide + talking-points slide).
 *  Auth-gated; resvg executes no script. */
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
  const { svg, format, title, talkingPoints, deck } = parsed.data;

  if (format === "png") {
    const png = rasterize(svg, 1920);
    return new Response(new Uint8Array(png), {
      headers: {
        "content-type": "image/png",
        "content-disposition": 'attachment; filename="country-one-pager.png"',
        "cache-control": "no-store",
      },
    });
  }

  const png = rasterize(svg, 1600);
  const dataUri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;

  // Structured executive deck (cover, snapshot, charts, ask, deals/risks,
  // scenarios, sources) when the client sends agent state.
  if (deck) {
    const buf = await renderAgentDeckPptx(deck as AgentDeckPayload, dataUri);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": 'attachment; filename="country-brief.pptx"',
        "cache-control": "no-store",
      },
    });
  }

  // Legacy fallback: infographic slide + talking-points slide.
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

  const s1 = pptx.addSlide();
  // 1280x760 → fit by height (7.5in), centred horizontally.
  s1.addImage({ data: dataUri, x: 0.35, y: 0, w: 12.63, h: 7.5 });

  if (talkingPoints && talkingPoints.length > 0) {
    const s2 = pptx.addSlide();
    s2.addText(title || "Talking points", {
      x: 0.5,
      y: 0.4,
      w: 12.3,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: "92722A",
      fontFace: "Inter",
    });
    s2.addText(
      talkingPoints.map((tp) => ({
        text: tp,
        options: { bullet: { code: "2022" }, fontSize: 18, color: "2C2B27", paraSpaceAfter: 12 },
      })),
      { x: 0.7, y: 1.6, w: 12, h: 5.4, fontFace: "Inter" },
    );
  }

  const buf = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": 'attachment; filename="country-brief.pptx"',
      "cache-control": "no-store",
    },
  });
}
