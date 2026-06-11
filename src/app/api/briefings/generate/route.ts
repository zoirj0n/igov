import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { COUNTRIES } from "@/lib/data/countries";
import { getReqId } from "@/lib/trace";
import { CloudClassificationError, generateBriefing } from "@/services/ai";
import { logAudit } from "@/services/audit";
import { BudgetExceededError, OfflineModeError } from "@/services/llm";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { logErrorBg } from "@/services/project-log";
import { saveBriefing } from "@/services/repo/briefings";
import type { Classification } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  countryIso3: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  audience: z.string().min(2).max(120),
  topics: z.array(z.string().min(2).max(80)).min(1).max(10),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
});

export async function POST(req: Request) {
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

  const country = COUNTRIES.find((c) => c.iso3 === parsed.data.countryIso3);
  if (!country) {
    return NextResponse.json({ error: "unknown country" }, { status: 404 });
  }

  const user = await getCurrentUser();
  const resolved = user ? resolveDefaultClassification(user) : null;
  const classification: Classification =
    parsed.data.classification ?? resolved?.value ?? "internal";
  const classificationSource = parsed.data.classification
    ? "request"
    : (resolved?.source ?? "fallback");

  if (user && !canRead(user, classification)) {
    logAudit(user, "briefing.generate.denied", "briefing", {
      resourceId: parsed.data.countryIso3,
      classification,
      meta: { reason: "insufficient clearance", classificationSource },
    });
    return NextResponse.json(
      { error: `insufficient clearance: required ${classification}, have ${user.clearance}` },
      { status: 403 },
    );
  }

  try {
    const reqId = getReqId(req);
    const generated = await generateBriefing(
      {
        ...parsed.data,
        classification,
        countryName: country.nameEn,
      },
      {
        actor: user?.email,
        actorDept: user?.departmentId,
        reqId,
      },
    );
    const id = `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const saved = await saveBriefing({
      id,
      title: generated.title || `Briefing — ${country.nameEn}`,
      countryIso3: parsed.data.countryIso3,
      audience: parsed.data.audience,
      classification: generated.classification ?? classification,
      createdBy: user?.email ?? "system",
      createdAt: new Date().toISOString(),
      body: generated.strategicOverview ?? "",
      talkingPoints: generated.talkingPoints,
      risks: generated.risks,
      opportunities: generated.opportunities,
      citations: generated.citations,
      confidence: generated.confidence,
    });
    logAudit(user, "briefing.generate.ok", "briefing", {
      resourceId: parsed.data.countryIso3,
      classification,
      meta: {
        briefingId: saved.id,
        audience: parsed.data.audience,
        topics: parsed.data.topics.length,
        actorDepartmentId: user?.departmentId,
        classificationSource,
        clampedFromClearance: resolved?.clampedFromClearance,
      },
    });
    return NextResponse.json({ ...generated, id: saved.id });
  } catch (err) {
    if (err instanceof CloudClassificationError) {
      logAudit(user, "briefing.generate.cloud_class_block", "briefing", {
        resourceId: parsed.data.countryIso3,
        classification,
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
      logAudit(user, "llm.offline.blocked", "briefing", {
        resourceId: parsed.data.countryIso3,
        meta: { provider: err.provider, step: "briefing" },
      });
      return NextResponse.json(
        { error: err.message, offline: true, blockedProvider: err.provider },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "internal error";
    logAudit(user, "briefing.generate.error", "briefing", {
      resourceId: parsed.data.countryIso3,
      meta: { error: message },
    });
    logErrorBg({
      title: `briefing ${message.slice(0, 80)}`,
      actor: user?.email ?? "anon",
      kind: "runtime",
      area: "src/app/api/briefings/generate/route.ts",
      message,
      stack: err instanceof Error ? err.stack : undefined,
      classification: "internal",
      links: `country ${parsed.data.countryIso3}`,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
