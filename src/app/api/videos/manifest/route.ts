import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import type { VideoVariant } from "@/services/video/script";
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

const BodySchema = z.object({
  variant: VariantSchema,
  countries: z
    .array(z.string().regex(/^[A-Z]{3}$/))
    .min(1)
    .max(8),
  durationSeconds: z.number().int().min(1).max(600),
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

  const variant = parsed.data.variant as VideoVariant;
  const cls = variant.classification as Classification;
  if (CLEARANCE_RANK[cls] > CLEARANCE_RANK[user.clearance as Classification]) {
    return NextResponse.json(
      { error: `insufficient clearance: required ${cls}, have ${user.clearance}` },
      { status: 403 },
    );
  }

  const manifest = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    platform: "country-intelligence",
    generatedBy: user.email,
    classification: cls,
    countries: parsed.data.countries,
    durationSeconds: parsed.data.durationSeconds,
    aspectRatio: "16:9",
    resolution: { width: 1920, height: 1080, fps: 30 },
    style: variant.style,
    confidence: variant.confidence,
    title: variant.title,
    hook: variant.hook,
    scenes: variant.scenes.map((s) => ({
      id: `scene_${String(s.index + 1).padStart(2, "0")}`,
      startSec: s.startSec,
      endSec: s.endSec,
      durationSec: s.endSec - s.startSec,
      visual: { direction: s.visual },
      overlay: s.onScreenText
        ? { text: s.onScreenText, position: "bottom-left", style: "white-on-dark" }
        : null,
      narration: {
        text: s.narration,
        voice: "neutral-en",
        wpm: estimateWpm(s.narration, s.endSec - s.startSec),
      },
      source: s.source ?? null,
    })),
    citations: variant.citations,
    rendering: {
      compatibleWith: ["remotion", "heygen", "ffmpeg+still-frames", "browser-native-tts"],
      assets: {
        srt: "/api/videos/srt",
        storyboardPdf: "/api/videos/storyboard",
      },
    },
  };

  logAudit(user, "video.manifest.ok", "video", {
    resourceId: variant.id,
    classification: cls,
    meta: { scenes: variant.scenes.length },
  });

  const slug = variant.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}-manifest.json"`,
      "x-classification": cls,
    },
  });
}

function estimateWpm(text: string, durationSec: number): number {
  if (durationSec <= 0) return 160;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round((words / durationSec) * 60);
}
