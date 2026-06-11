import { CloudClassificationError } from "@/services/ai";
import { completeText, getProvider, isCloud, resolveProvider } from "@/services/llm";
import type { Classification } from "@/types";

export type VideoStyle = "executive" | "documentary" | "data-narrative" | "diplomatic";

export interface VideoScriptRequest {
  prompt: string;
  countries: string[];
  durationSeconds: number;
  style: VideoStyle;
  classification: Classification;
}

export interface VideoScene {
  index: number;
  startSec: number;
  endSec: number;
  visual: string;
  onScreenText: string;
  narration: string;
  source?: string;
}

export interface VideoVariant {
  id: string;
  style: VideoStyle;
  title: string;
  hook: string;
  scenes: VideoScene[];
  citations: string[];
  classification: Classification;
  confidence: "high" | "med" | "low";
}

export interface VideoScriptResult {
  variants: VideoVariant[];
  usedRealApi: boolean;
}

const SYSTEM_PROMPT = `You are a video producer for the UAE Country Intelligence Platform.

Output STRICT JSON only — no prose, no markdown fences, no explanation.

Each variant produces a short executive video with timed scenes. Hard rules:
- Total scene duration MUST sum to the requested durationSeconds.
- Each scene <= 12 seconds.
- Narration: ≤ 28 words per scene, executive register, no hedging.
- onScreenText: ≤ 8 words, sentence case.
- visual: one-sentence direction (e.g. "Map of UAE with partner-country dots pulsing").
- source: cite a real source if applicable (World Bank, IRENA, IEA, UN Comtrade, etc.).
- Open with hook (one sentence) + close with explicit call-to-action.
- No fabrication: if a number is uncertain, state confidence; never invent agreements or quotes.
- Respect classification: never elevate above caller tier.`;

function buildUserPrompt(req: VideoScriptRequest): string {
  return `Prompt: ${req.prompt}

Countries: ${req.countries.join(", ") || "global"}
Duration: ${req.durationSeconds} seconds total
Variants requested: 4 (one per style — executive, documentary, data-narrative, diplomatic)
Classification: ${req.classification}

Return JSON:
{
  "variants": [
    {
      "id": "v_<style>",
      "style": "executive" | "documentary" | "data-narrative" | "diplomatic",
      "title": "string (<= 70 chars)",
      "hook": "string (one sentence, opens the video)",
      "scenes": [
        {
          "index": 0,
          "startSec": 0,
          "endSec": <int>,
          "visual": "string",
          "onScreenText": "string (<= 8 words)",
          "narration": "string (<= 28 words)",
          "source": "string (optional, e.g. 'World Bank, 2025')"
        }
        ...
      ],
      "citations": ["...", "..."],
      "confidence": "high" | "med" | "low"
    }
  ]
}`;
}

export interface GenerateVideoScriptOpts {
  actor?: string;
  actorDept?: string;
  reqId?: string;
}

export async function generateVideoScript(
  req: VideoScriptRequest,
  opts: GenerateVideoScriptOpts = {},
): Promise<VideoScriptResult> {
  // Gate runs before mock fallback so cloud providers cannot bypass via missing API key.
  const resolved = resolveProvider(req.classification);
  if (
    isCloud(resolved) &&
    (req.classification === "confidential" || req.classification === "secret")
  ) {
    throw new CloudClassificationError(req.classification, resolved);
  }
  const provider = getProvider(resolved);
  if (!provider.available()) {
    return { variants: mockVariants(req), usedRealApi: false };
  }
  try {
    const result = await completeText({
      maxTokens: 3072,
      classification: req.classification,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(req) }],
      step: "video",
      actor: opts.actor,
      actorDept: opts.actorDept,
      reqId: opts.reqId,
    });
    const parsed = extractJson(result.text);
    if (!parsed || !Array.isArray(parsed.variants)) {
      return { variants: mockVariants(req), usedRealApi: false };
    }
    const variants: VideoVariant[] = parsed.variants.map((v: VideoVariant, i: number) => ({
      ...v,
      id: typeof v.id === "string" ? v.id : `v_${i}`,
      classification: req.classification,
    }));
    return { variants, usedRealApi: true };
  } catch (err) {
    if (err instanceof CloudClassificationError) throw err;
    return { variants: mockVariants(req), usedRealApi: false };
  }
}

function extractJson(text: string): { variants: VideoVariant[] } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : text;
  if (!candidate) return null;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function mockVariants(req: VideoScriptRequest): VideoVariant[] {
  const styles: VideoStyle[] = ["executive", "documentary", "data-narrative", "diplomatic"];
  return styles.map((s, _idx) => ({
    id: `v_${s}`,
    style: s,
    title: `${req.countries.join(" × ")} — ${s} cut`,
    hook: `Mock ${s} hook for ${req.prompt.slice(0, 60)}.`,
    scenes: buildMockScenes(req, s),
    citations: ["World Bank, 2025", "IRENA, 2025"],
    classification: req.classification,
    confidence: "low",
  }));
}

function buildMockScenes(req: VideoScriptRequest, style: VideoStyle): VideoScene[] {
  const n = Math.max(3, Math.min(8, Math.ceil(req.durationSeconds / 10)));
  const each = Math.floor(req.durationSeconds / n);
  const scenes: VideoScene[] = [];
  for (let i = 0; i < n; i++) {
    scenes.push({
      index: i,
      startSec: i * each,
      endSec: i === n - 1 ? req.durationSeconds : (i + 1) * each,
      visual:
        i === 0
          ? `Hero shot — ${req.countries.join(" + ")} flags merge over world map`
          : i === n - 1
            ? "Call to action — 90-day working group banner"
            : `${style} segment ${i}: data viz of key indicator`,
      onScreenText:
        i === 0 ? `${req.countries.join(" × ")}` : i === n - 1 ? "Next: 90 days" : `Scene ${i + 1}`,
      narration:
        i === 0
          ? `Opening on shared strategic priorities of ${req.countries.join(" and ")}.`
          : i === n - 1
            ? "Close: name principals, propose ninety-day working group, defined deliverables."
            : `Mock ${style} narration for scene ${i + 1}. Set ANTHROPIC_API_KEY for real script.`,
      source: i % 2 === 0 ? "World Bank, 2025" : "IRENA, 2025",
    });
  }
  return scenes;
}
