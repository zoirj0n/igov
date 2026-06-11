import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { getReqId } from "@/lib/trace";
import { logAudit } from "@/services/audit";
import { logChatTurn } from "@/services/chat-log";
import { BudgetExceededError } from "@/services/llm";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { logErrorBg } from "@/services/project-log";
import { runRag } from "@/services/rag/orchestrator";
import type { Classification } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(1).max(4000),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
  sessionId: z.string().min(1).max(80).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(10)
    .optional(),
});

function genId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

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

  const resolved = resolveDefaultClassification(user);
  const classification: Classification = parsed.data.classification ?? resolved.value;
  const classificationSource = parsed.data.classification ? "request" : resolved.source;

  if (!canRead(user, classification)) {
    logAudit(user, "rag.denied", "rag", {
      classification,
      meta: { reason: "insufficient clearance", classificationSource },
    });
    return NextResponse.json(
      { error: `insufficient clearance: required ${classification}, have ${user.clearance}` },
      { status: 403 },
    );
  }

  const sessionId = parsed.data.sessionId ?? req.headers.get("x-session-id") ?? `anon-${genId()}`;
  const reqId = getReqId(req);

  logAudit(user, "rag.request", "rag", {
    resourceId: sessionId,
    classification,
    reqId,
    meta: {
      questionPreview: parsed.data.question.slice(0, 80),
      classificationSource,
      actorDepartmentId: user.departmentId,
    },
  });

  logChatTurn({
    sessionId,
    reqId,
    turnId: genId(),
    role: "user",
    text: parsed.data.question,
    classification,
    actor: user.email,
  });

  const t0 = Date.now();
  try {
    const result = await runRag({
      question: parsed.data.question,
      user,
      classification,
      sessionId,
      reqId,
      history: parsed.data.history,
    });
    logAudit(user, "rag.ok", "rag", {
      resourceId: sessionId,
      classification,
      reqId,
      meta: {
        intent: result.intent,
        abstained: result.abstained,
        violationsCount: result.violations.length,
        citationsCount: result.citations.length,
        durationMs: result.meta.durationMs,
        embedVendor: result.meta.embedVendor,
        rerankVendor: result.meta.rerankVendor,
        providerTier: result.meta.providerTier,
      },
    });

    if (result.safety.injectionFindings.length > 0) {
      logAudit(user, "rag.safety.injection_blocked", "rag", {
        resourceId: sessionId,
        classification,
        reqId,
        meta: {
          count: result.safety.injectionFindings.length,
          patterns: result.safety.injectionFindings.map((f) => f.patternName),
          passageIds: result.safety.injectionFindings.map((f) => f.passageId),
        },
      });
    }
    if (result.safety.redactions.length > 0) {
      logAudit(user, "rag.safety.pii_redacted", "rag", {
        resourceId: sessionId,
        classification,
        reqId,
        meta: {
          kinds: result.safety.redactions.map((r) => ({ kind: r.kind, count: r.count })),
          totalRedactions: result.safety.redactions.reduce((s, r) => s + r.count, 0),
        },
      });
    }
    if (result.safety.echoedInjection) {
      logAudit(user, "rag.safety.echo_detected", "rag", {
        resourceId: sessionId,
        classification,
        reqId,
        meta: { note: "model output echoed injection pattern; surfaced anyway after PII redact" },
      });
    }

    const assistantText = result.abstained
      ? `ABSTAIN — ${(result.abstainReasons ?? []).join("; ")}`
      : (result.answer ?? "");
    if (assistantText) {
      logChatTurn({
        sessionId,
        reqId,
        turnId: genId(),
        role: "assistant",
        text: assistantText,
        citations: result.citations,
        classification,
        latencyMs: Date.now() - t0,
        actor: user.email,
      });
    }

    return NextResponse.json({ ...result, sessionId });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        {
          error: err.message,
          budget: err.decision,
        },
        { status: 429, headers: { "retry-after": "86400" } },
      );
    }
    const msg = err instanceof Error ? err.message : "rag failed";
    logAudit(user, "rag.error", "rag", {
      classification,
      meta: { error: msg },
    });
    logErrorBg({
      title: `rag ${msg.slice(0, 80)}`,
      actor: user.email,
      kind: "runtime",
      area: "src/app/api/rag/route.ts",
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
      classification: "internal",
      links: `sessionId ${sessionId}`,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
