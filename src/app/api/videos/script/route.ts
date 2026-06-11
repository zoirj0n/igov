import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { getReqId } from "@/lib/trace";
import { CloudClassificationError } from "@/services/ai";
import { logAudit } from "@/services/audit";
import { BudgetExceededError, OfflineModeError } from "@/services/llm";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { generateVideoScript } from "@/services/video/script";
import type { Classification } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().min(4).max(2000),
  countries: z
    .array(z.string().regex(/^[A-Z]{3}$/))
    .min(1)
    .max(8),
  durationSeconds: z.number().int().min(15).max(180).default(60),
  style: z.enum(["executive", "documentary", "data-narrative", "diplomatic"]).default("executive"),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
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

  const userClearance = user.clearance as Classification;
  const resolved = resolveDefaultClassification(user);
  const requested: Classification = parsed.data.classification ?? resolved.value;
  const classificationSource = parsed.data.classification ? "request" : resolved.source;

  if (CLEARANCE_RANK[requested] > CLEARANCE_RANK[userClearance]) {
    logAudit(user, "video.script.denied", "video", {
      resourceId: parsed.data.countries.join(","),
      classification: requested,
      meta: { reason: "insufficient clearance", userClearance },
    });
    return NextResponse.json(
      { error: `insufficient clearance: required ${requested}, have ${userClearance}` },
      { status: 403 },
    );
  }

  const t0 = Date.now();
  try {
    const reqId = getReqId(req);
    const result = await generateVideoScript(
      {
        prompt: parsed.data.prompt,
        countries: parsed.data.countries,
        durationSeconds: parsed.data.durationSeconds,
        style: parsed.data.style,
        classification: requested,
      },
      { actor: user.email, actorDept: user.departmentId, reqId },
    );
    logAudit(user, "video.script.ok", "video", {
      resourceId: parsed.data.countries.join(","),
      classification: requested,
      meta: {
        variants: result.variants.length,
        durationSeconds: parsed.data.durationSeconds,
        ms: Date.now() - t0,
        usedRealApi: result.usedRealApi,
        actorDepartmentId: user.departmentId,
        classificationSource,
        clampedFromClearance: resolved.clampedFromClearance,
      },
    });
    return NextResponse.json(
      { ...result, classification: requested, durationSeconds: parsed.data.durationSeconds },
      { headers: { "x-classification": requested } },
    );
  } catch (err) {
    if (err instanceof CloudClassificationError) {
      logAudit(user, "video.script.cloud_class_block", "video", {
        resourceId: parsed.data.countries.join(","),
        classification: requested,
        meta: { provider: err.provider, classification: err.classification },
      });
      return NextResponse.json(
        {
          error: `Classification "${err.classification}" requires on-prem LLM. Current provider is cloud (${err.provider}). Admin can switch in Settings → AI provider.`,
        },
        { status: 451 },
      );
    }
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: err.decision.message ?? "budget exceeded", scope: err.decision.scope },
        { status: 429 },
      );
    }
    if (err instanceof OfflineModeError) {
      logAudit(user, "llm.offline.blocked", "video", {
        resourceId: parsed.data.countries.join(","),
        meta: { provider: err.provider, step: "video" },
      });
      return NextResponse.json(
        { error: err.message, offline: true, blockedProvider: err.provider },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "script generation failed";
    logAudit(user, "video.script.error", "video", {
      resourceId: parsed.data.countries.join(","),
      meta: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
