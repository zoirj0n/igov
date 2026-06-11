import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { COUNTRIES } from "@/lib/data/countries";
import { getReqId } from "@/lib/trace";
import { CloudClassificationError, generateSectorInsights } from "@/services/ai";
import { logAudit } from "@/services/audit";
import { BudgetExceededError, OfflineModeError } from "@/services/llm";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import type { Classification } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sector: z.string().min(2).max(60),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
});

/** Agentic research for a user-defined sector tab on the country profile. */
export async function POST(req: Request, ctx: { params: Promise<{ iso3: string }> }) {
  const { iso3 } = await ctx.params;
  const upper = iso3.toUpperCase();
  const country = COUNTRIES.find((c) => c.iso3 === upper);
  if (!country) return NextResponse.json({ error: "unknown country" }, { status: 404 });

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

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const resolved = resolveDefaultClassification(user);
  const classification: Classification =
    parsed.data.classification ?? resolved?.value ?? "internal";

  if (!canRead(user, classification)) {
    logAudit(user, "sector.insights.denied", "country", {
      resourceId: upper,
      classification,
      meta: { sector: parsed.data.sector, reason: "insufficient clearance" },
    });
    return NextResponse.json(
      { error: `insufficient clearance: required ${classification}, have ${user.clearance}` },
      { status: 403 },
    );
  }

  try {
    const insights = await generateSectorInsights(
      {
        countryIso3: upper,
        countryName: country.nameEn,
        sector: parsed.data.sector,
        classification,
      },
      { actor: user.email, actorDept: user.departmentId, reqId: getReqId(req) },
    );
    logAudit(user, "sector.insights.ok", "country", {
      resourceId: upper,
      classification,
      meta: { sector: parsed.data.sector, confidence: insights.confidence },
    });
    return NextResponse.json(insights);
  } catch (err) {
    if (err instanceof CloudClassificationError) {
      return NextResponse.json(
        {
          error: `Classification "${err.classification}" requires on-prem LLM. Current provider is cloud (${err.provider}).`,
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
      return NextResponse.json(
        { error: err.message, offline: true, blockedProvider: err.provider },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : "internal error";
    logAudit(user, "sector.insights.error", "country", {
      resourceId: upper,
      meta: { sector: parsed.data.sector, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
