import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { getReqId } from "@/lib/trace";
import { type ChatTurn, CloudClassificationError, chatComplete, chatStream } from "@/services/ai";
import { logAudit } from "@/services/audit";
import { logChatTurn } from "@/services/chat-log";
import { BudgetExceededError, OfflineModeError, getLlmConfig } from "@/services/llm";
import { checkBudget } from "@/services/llm/budget";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { logErrorBg } from "@/services/project-log";
import type { Classification } from "@/types";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8_000),
});

const BodySchema = z.object({
  messages: z.array(TurnSchema).min(1).max(40),
  stream: z.boolean().optional(),
  classification: z.enum(["public", "internal", "confidential", "secret"]).optional(),
});

function genId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

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

  const sessionId = req.headers.get("x-session-id") ?? `anon-${genId()}`;
  const reqId = getReqId(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;

  const authedUser = await getCurrentUser();
  const userClearance: Classification = (authedUser?.clearance ?? "internal") as Classification;
  const resolvedDefault = authedUser ? resolveDefaultClassification(authedUser) : null;
  const requested: Classification =
    parsed.data.classification ?? resolvedDefault?.value ?? userClearance;
  const classificationSource = parsed.data.classification
    ? "request"
    : (resolvedDefault?.source ?? "fallback");

  if (CLEARANCE_RANK[requested] > CLEARANCE_RANK[userClearance]) {
    logAudit(authedUser, "ai.chat.denied", "chat", {
      resourceId: sessionId,
      classification: requested,
      meta: { reason: "insufficient clearance", userClearance },
    });
    return NextResponse.json(
      { error: `insufficient clearance: required ${requested}, have ${userClearance}` },
      { status: 403 },
    );
  }

  const llmCfg = getLlmConfig();
  logAudit(authedUser, "ai.chat.request", "chat", {
    resourceId: sessionId,
    classification: requested,
    ip,
    reqId,
    meta: {
      turns: parsed.data.messages.length,
      streamed: Boolean(parsed.data.stream),
      provider: llmCfg.provider,
      model: llmCfg.model,
      actorDepartmentId: authedUser?.departmentId,
      classificationSource,
      clampedFromClearance: resolvedDefault?.clampedFromClearance,
    },
  });

  const messages: ChatTurn[] = parsed.data.messages;
  const actor = authedUser?.email;
  const latest = messages[messages.length - 1];
  if (latest && latest.role === "user") {
    logChatTurn({
      sessionId,
      turnId: genId(),
      role: "user",
      text: latest.content,
      userAgent,
      ip,
      classification: requested,
      actor,
    });
  }

  const wantsStream =
    parsed.data.stream === true || req.headers.get("accept") === "text/event-stream";

  if (wantsStream) {
    // Pre-call budget gate (stream path bypasses completeText).
    const budgetDecision = checkBudget(actor ?? "system", authedUser?.departmentId);
    if (!budgetDecision.allowed) {
      logAudit(authedUser, "cost.budget.blocked", "cost", {
        resourceId: sessionId,
        classification: requested,
        reqId,
        meta: {
          scope: budgetDecision.scope,
          spendUsd: budgetDecision.spendUsd,
          thresholdUsd: budgetDecision.thresholdUsd,
          step: "chat.stream",
          actor,
          actorDept: authedUser?.departmentId,
        },
      });
      return NextResponse.json(
        { error: budgetDecision.message ?? "budget exceeded", scope: budgetDecision.scope },
        { status: 429 },
      );
    }
    const start = Date.now();
    const turnId = genId();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let chunks: AsyncGenerator<
            Awaited<ReturnType<typeof chatStream>> extends AsyncGenerator<infer T> ? T : never,
            void,
            unknown
          >;
          try {
            chunks = chatStream(messages, requested, {
              actor,
              actorDept: authedUser?.departmentId,
              reqId,
              sessionId,
            });
          } catch (err) {
            if (err instanceof CloudClassificationError) {
              const msg = `Classification "${err.classification}" requires on-prem LLM. Current provider is cloud (${err.provider}). Admin can switch in Settings → AI provider.`;
              logAudit(authedUser, "ai.chat.cloud_class_block", "chat", {
                resourceId: sessionId,
                classification: requested,
                meta: { provider: err.provider, classification: err.classification },
              });
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ kind: "error", error: msg })}\n\n`),
              );
              controller.close();
              return;
            }
            throw err;
          }
          for await (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            if (chunk.kind === "done") {
              if (CLEARANCE_RANK[chunk.classification] > CLEARANCE_RANK[userClearance]) {
                logAudit(authedUser, "ai.chat.output.elevated", "chat", {
                  resourceId: sessionId,
                  classification: chunk.classification,
                  meta: { userClearance, blocked: true },
                });
              }
              logChatTurn({
                sessionId,
                turnId,
                role: "assistant",
                text: chunk.text,
                citations: chunk.citations,
                usedRealApi: chunk.usedRealApi,
                latencyMs: Date.now() - start,
                classification: chunk.classification,
                actor,
              });
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          const msg = err instanceof Error ? err.message : "stream error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ kind: "error", error: msg })}\n\n`),
          );
          logChatTurn({
            sessionId,
            turnId,
            role: "system",
            text: `error: ${msg}`,
            latencyMs: Date.now() - start,
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "x-session-id": sessionId,
        "x-classification": requested,
      },
    });
  }

  const start = Date.now();
  try {
    let result;
    try {
      result = await chatComplete(messages, requested, {
        actor,
        actorDept: authedUser?.departmentId,
        reqId,
        sessionId,
      });
    } catch (err) {
      if (err instanceof CloudClassificationError) {
        logAudit(authedUser, "ai.chat.cloud_class_block", "chat", {
          resourceId: sessionId,
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
      throw err;
    }
    const latencyMs = Date.now() - start;
    if (CLEARANCE_RANK[result.classification] > CLEARANCE_RANK[userClearance]) {
      logAudit(authedUser, "ai.chat.output.elevated", "chat", {
        resourceId: sessionId,
        classification: result.classification,
        meta: { userClearance, blocked: true },
      });
    }
    logChatTurn({
      sessionId,
      turnId: genId(),
      role: "assistant",
      text: result.text,
      citations: result.citations,
      usedRealApi: result.usedRealApi,
      latencyMs,
      classification: result.classification,
      actor,
    });
    return NextResponse.json(result, {
      headers: { "x-session-id": sessionId, "x-classification": result.classification },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error";
    logChatTurn({
      sessionId,
      turnId: genId(),
      role: "system",
      text: `error: ${message}`,
      latencyMs: Date.now() - start,
    });
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: err.message, budget: err.decision },
        { status: 429, headers: { "retry-after": "86400" } },
      );
    }
    if (err instanceof OfflineModeError) {
      logAudit(authedUser, "llm.offline.blocked", "chat", {
        resourceId: sessionId,
        meta: { provider: err.provider, step: "chat" },
      });
      return NextResponse.json(
        { error: err.message, offline: true, blockedProvider: err.provider },
        { status: 503 },
      );
    }
    logErrorBg({
      title: `chat ${message.slice(0, 80)}`,
      actor: authedUser?.email ?? "anon",
      kind: "runtime",
      area: "src/app/api/chat/route.ts",
      message,
      stack: err instanceof Error ? err.stack : undefined,
      classification: "internal",
      links: `sessionId ${sessionId}`,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
