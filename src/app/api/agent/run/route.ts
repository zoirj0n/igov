import { getCurrentUser } from "@/lib/auth/server";
import { runAgent } from "@/services/agent/graph";
import type { AgentState } from "@/services/agent/state";
import { logAudit } from "@/services/audit";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import { saveRun } from "@/services/repo/agent-runs";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  command: z.string().min(2).max(500),
  role: z.string().max(40).optional(),
  counterpartName: z.string().max(80).optional(),
});

/**
 * Streams the strategic-advisor agent run as Server-Sent Events. Each `data:`
 * frame is a RunEvent ({event:"trace"|"final"|"error", state}). The UI lights
 * up its step tracker from trace events and renders the final state.
 */
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
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const resolved = resolveDefaultClassification(user);
  const classification = resolved?.value ?? "internal";

  logAudit(user, "agent.run.start", "briefing", {
    classification,
    meta: { command: parsed.data.command.slice(0, 200) },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Heartbeat: the compose step runs the scribe for minutes with no events,
      // and a silent SSE stream gets dropped by the browser/OS/proxy as idle
      // ("network error"). A comment line keeps the connection alive; SSE
      // comments (": …") are ignored by the client parser. Send one immediately
      // so the connection is established before the first long model call.
      controller.enqueue(encoder.encode(": connected\n\n"));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          /* stream already closed */
        }
      }, 10_000);
      const t0 = Date.now();
      let lastFinal: AgentState | null = null;
      try {
        for await (const ev of runAgent(parsed.data.command, {
          classification,
          role: parsed.data.role,
          counterpartName: parsed.data.counterpartName,
        })) {
          if (ev.event === "final" && ev.state) lastFinal = ev.state as AgentState;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
        if (lastFinal) {
          const rec = saveRun({
            command: parsed.data.command,
            role: parsed.data.role,
            state: lastFinal,
            createdBy: user.email ?? "system",
            durationMs: Date.now() - t0,
          });
          logAudit(user, "agent.run.saved", "briefing", {
            classification,
            meta: { runId: rec.id, iso3: rec.iso3 },
          });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ event: "saved", runId: rec.id })}\n\n`),
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ event: "error", message })}\n\n`),
        );
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
