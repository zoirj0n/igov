import { getCurrentUser } from "@/lib/auth/server";
import { canRead } from "@/lib/auth/types";
import { getReqId } from "@/lib/trace";
import { logAudit } from "@/services/audit";
import { logChatTurn } from "@/services/chat-log";
import { buildComparison } from "@/services/chat/comparison";
import { classifyAsk } from "@/services/chat/intent";
import { completeText } from "@/services/llm";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { runRag } from "@/services/rag/orchestrator";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  question: z.string().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(12)
    .optional(),
});

function genId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { question, history } = parsed.data;

  const resolved = resolveDefaultClassification(user);
  const classification = resolved.value;

  if (!canRead(user, classification)) {
    logAudit(user, "chat.ask.denied", "chat", {
      classification,
      meta: { reason: "insufficient clearance" },
    });
    return NextResponse.json(
      { error: `insufficient clearance: required ${classification}, have ${user.clearance}` },
      { status: 403 },
    );
  }

  const sessionId = req.headers.get("x-session-id") ?? `anon-${genId()}`;
  const reqId = getReqId(req);

  const triage = classifyAsk(question);
  logAudit(user, "chat.ask", "chat", {
    classification,
    reqId,
    meta: { kind: triage.kind, q: question.slice(0, 120) },
  });

  if (triage.kind === "prepare") {
    return NextResponse.json({ kind: "prepare", iso3: triage.countries[0] });
  }

  logChatTurn({
    sessionId,
    reqId,
    turnId: genId(),
    role: "user",
    text: question,
    classification,
    actor: user.email,
  });

  const t0 = Date.now();
  const rag = await runRag({ question, user, classification, sessionId, reqId, history });

  // Cloud models often ignore the strict <fig>/<cite> tag grammar the RAG
  // validators enforce, which strips every factual sentence and leaves only
  // the classification header. Rather than returning an empty shell, degrade
  // to a conversational answer that names its sources inline.
  let answer = rag.answer;
  let citations = rag.citations;
  const body = (answer ?? "").replace(/^\[CLASSIFICATION:[^\]]*\]\s*/i, "").trim();
  if (!rag.abstained && body.length < 20) {
    try {
      const conv = await completeText({
        classification,
        system:
          "You are the Country Intelligence assistant for UAE government leadership. Answer concisely in 2–5 sentences, grounded in well-known public data. Name the source of any figure inline (e.g. World Bank, IMF, UN Comtrade). If you are not confident, say so plainly. Reply in the language of the question.",
        messages: [...(history ?? []), { role: "user" as const, content: question }],
        maxTokens: 700,
        actor: user.email,
        sessionId,
        reqId,
        step: "chat",
      });
      const text = conv.text?.replace(/^\[CLASSIFICATION:[^\]]*\]\s*/i, "").trim();
      if (text) {
        answer = text;
        citations = [];
      }
    } catch {
      // keep the RAG result; clients handle the empty/abstained case
    }
  }

  const assistantText = rag.abstained
    ? `ABSTAIN — ${(rag.abstainReasons ?? []).join("; ")}`
    : (answer ?? "");
  if (assistantText) {
    logChatTurn({
      sessionId,
      reqId,
      turnId: genId(),
      role: "assistant",
      text: assistantText,
      citations,
      classification,
      latencyMs: Date.now() - t0,
      actor: user.email,
    });
  }

  return NextResponse.json({
    kind: triage.kind,
    answer,
    abstained: rag.abstained,
    abstainReasons: rag.abstainReasons,
    citations,
    comparison: triage.kind === "compare" ? buildComparison(triage.countries) : undefined,
    suggestIso3: triage.countries[0],
  });
}
