import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AuthUser } from "@/lib/auth/types";
import { forwardEvent } from "@/lib/siem";
import { recordSafetyEvent } from "@/services/security/anomaly";

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  classification?: "public" | "internal" | "confidential" | "secret";
  ip?: string;
  reqId?: string;
  meta?: Record<string, unknown>;
}

const RING_MAX = 1000;
const ring: AuditEvent[] = [];
const AUDIT_DIR = path.join(process.cwd(), "logs");
const AUDIT_FILE = path.join(AUDIT_DIR, "audit.jsonl");

function genId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

let ensured = false;
async function ensureDir(): Promise<void> {
  if (ensured) return;
  await mkdir(AUDIT_DIR, { recursive: true });
  ensured = true;
}

export function logAudit(
  user: AuthUser | null,
  action: string,
  resourceType: string,
  opts: {
    resourceId?: string;
    classification?: AuditEvent["classification"];
    ip?: string;
    reqId?: string;
    meta?: AuditEvent["meta"];
  } = {},
): void {
  const event: AuditEvent = {
    id: genId(),
    ts: new Date().toISOString(),
    actor: user?.email ?? "anon",
    actorRole: user?.role,
    action,
    resourceType,
    resourceId: opts.resourceId,
    classification: opts.classification,
    ip: opts.ip,
    reqId: opts.reqId,
    meta: opts.meta,
  };
  ring.push(event);
  if (ring.length > RING_MAX) ring.shift();
  void persistEvent(event);
  forwardEvent({
    ts: event.ts,
    actor: event.actor,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    classification: event.classification,
    meta: event.meta,
  });

  // Safety burst detection — emit a separate anomaly audit event when an actor
  // crosses the threshold. Use a recursion guard via action prefix to avoid loops.
  if (!action.startsWith("security.anomaly.")) {
    const alert = recordSafetyEvent(action, event.actor);
    if (alert) {
      const anomalyEvent: AuditEvent = {
        id: genId(),
        ts: new Date().toISOString(),
        actor: alert.actor,
        actorRole: event.actorRole,
        action: "security.anomaly.threshold",
        resourceType: "security",
        meta: {
          triggeringAction: action,
          count: alert.count,
          threshold: alert.threshold,
          windowMs: alert.windowMs,
          firstAt: alert.firstAt,
          lastAt: alert.lastAt,
        },
      };
      ring.push(anomalyEvent);
      if (ring.length > RING_MAX) ring.shift();
      void persistEvent(anomalyEvent);
      forwardEvent({
        ts: anomalyEvent.ts,
        actor: anomalyEvent.actor,
        action: anomalyEvent.action,
        resourceType: anomalyEvent.resourceType,
        meta: anomalyEvent.meta,
      });
    }
  }
}

async function persistEvent(event: AuditEvent): Promise<void> {
  try {
    await ensureDir();
    await appendFile(AUDIT_FILE, `${JSON.stringify(event)}\n`, { encoding: "utf-8" });
  } catch {
    // swallow — never fail caller
  }
}

export function recentAudit(limit = 200): AuditEvent[] {
  return ring.slice(-limit).reverse();
}
