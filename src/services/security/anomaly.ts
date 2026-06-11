/**
 * Sliding-window safety-event anomaly detector.
 *
 * Counts safety-class events per actor in a rolling window.
 * Threshold breach → emit a single "anomaly" audit event (deduped per actor per cooldown).
 * Surfaced in /admin → Safety panel as a flagged-actors banner.
 *
 * Tunable via env:
 *   SECURITY_ANOMALY_WINDOW_MS    default 300000 (5 min)
 *   SECURITY_ANOMALY_THRESHOLD    default 5
 *   SECURITY_ANOMALY_COOLDOWN_MS  default 600000 (10 min)
 */

const WINDOW_MS = numEnv("SECURITY_ANOMALY_WINDOW_MS", 5 * 60_000);
const THRESHOLD = numEnv("SECURITY_ANOMALY_THRESHOLD", 5);
const COOLDOWN_MS = numEnv("SECURITY_ANOMALY_COOLDOWN_MS", 10 * 60_000);

function numEnv(name: string, dflt: number): number {
  const v = process.env[name];
  if (!v) return dflt;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

interface ActorStats {
  events: number[]; // unix-ms timestamps within window
  lastAlertAt?: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __ciAnomaly: Map<string, ActorStats> | undefined;
}

const state: Map<string, ActorStats> = globalThis.__ciAnomaly ?? new Map();
if (!globalThis.__ciAnomaly) globalThis.__ciAnomaly = state;

const SAFETY_ACTIONS = new Set<string>([
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
]);

export interface AnomalyAlert {
  actor: string;
  count: number;
  windowMs: number;
  threshold: number;
  firstAt: string;
  lastAt: string;
}

/**
 * Record a safety event and return an alert if the actor just crossed the
 * threshold within the window (and is not in cooldown). Returns null otherwise.
 */
export function recordSafetyEvent(action: string, actor: string): AnomalyAlert | null {
  if (!SAFETY_ACTIONS.has(action) || !actor || actor === "anon") return null;
  const now = Date.now();
  const cur = state.get(actor) ?? { events: [] };
  // Trim old events outside window
  cur.events = cur.events.filter((t) => now - t <= WINDOW_MS);
  cur.events.push(now);
  state.set(actor, cur);

  if (cur.events.length < THRESHOLD) return null;
  if (cur.lastAlertAt && now - cur.lastAlertAt < COOLDOWN_MS) return null;

  cur.lastAlertAt = now;
  return {
    actor,
    count: cur.events.length,
    windowMs: WINDOW_MS,
    threshold: THRESHOLD,
    firstAt: new Date(cur.events[0] ?? now).toISOString(),
    lastAt: new Date(cur.events[cur.events.length - 1] ?? now).toISOString(),
  };
}

export interface FlaggedActor {
  actor: string;
  countInWindow: number;
  lastEventAt: string;
  lastAlertAt?: string;
  flagged: boolean;
}

export function listFlaggedActors(): FlaggedActor[] {
  const now = Date.now();
  const out: FlaggedActor[] = [];
  for (const [actor, stats] of state.entries()) {
    const inWindow = stats.events.filter((t) => now - t <= WINDOW_MS);
    if (inWindow.length === 0) continue;
    out.push({
      actor,
      countInWindow: inWindow.length,
      lastEventAt: new Date(inWindow[inWindow.length - 1]!).toISOString(),
      lastAlertAt: stats.lastAlertAt ? new Date(stats.lastAlertAt).toISOString() : undefined,
      flagged: inWindow.length >= THRESHOLD,
    });
  }
  out.sort((a, b) => b.countInWindow - a.countInWindow);
  return out;
}

export function getConfig(): { windowMs: number; threshold: number; cooldownMs: number } {
  return { windowMs: WINDOW_MS, threshold: THRESHOLD, cooldownMs: COOLDOWN_MS };
}

export function resetAnomalyState(): void {
  state.clear();
}
