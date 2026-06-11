import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/server";
import { hasRole } from "@/lib/auth/types";
import { type AuditEvent, recentAudit } from "@/services/audit";
import { getConfig, listFlaggedActors } from "@/services/security/anomaly";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFETY_ACTIONS = new Set([
  "rag.safety.injection_blocked",
  "rag.safety.pii_redacted",
  "rag.safety.echo_detected",
  "ai.chat.cloud_class_block",
  "briefing.generate.cloud_class_block",
  "video.script.cloud_class_block",
  "ai.chat.denied",
  "briefing.generate.denied",
  "video.script.denied",
  "ai.chat.output.elevated",
  "security.anomaly.threshold",
]);

/**
 * Read audit jsonl from disk to cover events that fell out of the in-memory ring.
 * Limit to last 5000 lines (tail) for response speed.
 */
async function readAuditTail(maxLines = 5000): Promise<AuditEvent[]> {
  const file = path.join(process.cwd(), "logs", "audit.jsonl");
  try {
    const raw = await readFile(file, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());
    const tail = lines.slice(-maxLines);
    const out: AuditEvent[] = [];
    for (const line of tail) {
      try {
        out.push(JSON.parse(line) as AuditEvent);
      } catch {
        // skip bad line
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!hasRole(user, "admin")) {
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });
  }
  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit") ?? "100")));
  const action = url.searchParams.get("action") ?? undefined;

  const fromRing = recentAudit(1000);
  const fromDisk = await readAuditTail(5000);
  const seen = new Set<string>();
  const merged: AuditEvent[] = [];
  for (const ev of [...fromRing, ...fromDisk]) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    merged.push(ev);
  }
  const filtered = merged
    .filter((ev) => SAFETY_ACTIONS.has(ev.action))
    .filter((ev) => !action || ev.action === action)
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit);

  const counts: Record<string, number> = {};
  for (const ev of merged) {
    if (!SAFETY_ACTIONS.has(ev.action)) continue;
    counts[ev.action] = (counts[ev.action] ?? 0) + 1;
  }

  return NextResponse.json({
    events: filtered,
    totalsByAction: counts,
    flaggedActors: listFlaggedActors(),
    anomalyConfig: getConfig(),
  });
}
