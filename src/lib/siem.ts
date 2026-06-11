import { type Socket, createConnection } from "node:net";
import type { TLSSocket } from "node:tls";
import { connect as tlsConnect } from "node:tls";
import { logger } from "@/utils/logger";

export type Transport = "syslog-tcp" | "syslog-tls" | "http" | "none";

interface ForwarderConfig {
  transport: Transport;
  host?: string;
  port?: number;
  httpUrl?: string;
  httpToken?: string;
  facility: number;
  appName: string;
}

interface Forwardable {
  ts: string;
  actor?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  classification?: string;
  meta?: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line no-var
  var __ciSiem: { queue: Forwardable[]; flushing: boolean; sock?: Socket | TLSSocket } | undefined;
}

const QUEUE_MAX = 1000;
const BATCH_MAX = 50;
const FLUSH_INTERVAL_MS = 1000;

function getConfig(): ForwarderConfig {
  const transport = (process.env.SIEM_TRANSPORT ?? "none") as Transport;
  return {
    transport,
    host: process.env.SIEM_SYSLOG_HOST,
    port: Number.parseInt(process.env.SIEM_SYSLOG_PORT ?? "6514", 10),
    httpUrl: process.env.SIEM_HTTP_URL,
    httpToken: process.env.SIEM_HTTP_TOKEN,
    facility: 16,
    appName: process.env.SIEM_APP_NAME ?? "country-intel",
  };
}

export function siemEnabled(): boolean {
  return getConfig().transport !== "none";
}

function state(): NonNullable<typeof globalThis.__ciSiem> {
  if (!globalThis.__ciSiem) {
    globalThis.__ciSiem = { queue: [], flushing: false };
    startFlushLoop();
  }
  return globalThis.__ciSiem;
}

export function forwardEvent(event: Forwardable): void {
  if (!siemEnabled()) return;
  const s = state();
  s.queue.push(event);
  if (s.queue.length > QUEUE_MAX) {
    const dropped = s.queue.length - QUEUE_MAX;
    s.queue.splice(0, dropped);
    logger.warn({ dropped }, "siem queue overflow — dropped oldest events");
  }
}

function startFlushLoop(): void {
  if (typeof process === "undefined") return;
  const id = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);
  if ("unref" in id && typeof id.unref === "function") id.unref();
}

async function flush(): Promise<void> {
  const s = state();
  if (s.flushing || s.queue.length === 0) return;
  s.flushing = true;
  const cfg = getConfig();
  const batch = s.queue.splice(0, BATCH_MAX);
  try {
    if (cfg.transport === "http") {
      await flushHttp(cfg, batch);
    } else if (cfg.transport === "syslog-tcp" || cfg.transport === "syslog-tls") {
      await flushSyslog(cfg, batch);
    }
  } catch (err) {
    // requeue on failure (front of queue) up to QUEUE_MAX
    const room = QUEUE_MAX - s.queue.length;
    if (room > 0) s.queue.unshift(...batch.slice(0, room));
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), n: batch.length },
      "siem flush failed",
    );
  } finally {
    s.flushing = false;
  }
}

async function flushHttp(cfg: ForwarderConfig, batch: Forwardable[]): Promise<void> {
  if (!cfg.httpUrl) return;
  const res = await fetch(cfg.httpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.httpToken ? { authorization: `Bearer ${cfg.httpToken}` } : {}),
    },
    body: JSON.stringify({ events: batch }),
  });
  if (!res.ok) throw new Error(`siem http ${res.status}`);
}

function ensureSocket(cfg: ForwarderConfig): Promise<Socket | TLSSocket> {
  const s = state();
  if (s.sock && !s.sock.destroyed) return Promise.resolve(s.sock);
  return new Promise((resolve, reject) => {
    const host = cfg.host;
    const port = cfg.port ?? 6514;
    if (!host) {
      reject(new Error("SIEM_SYSLOG_HOST not set"));
      return;
    }
    const sock =
      cfg.transport === "syslog-tls"
        ? tlsConnect({ host, port, rejectUnauthorized: true })
        : createConnection({ host, port });
    sock.once("connect", () => {
      s.sock = sock;
      sock.on("error", () => {
        sock.destroy();
        if (s.sock === sock) s.sock = undefined;
      });
      sock.on("close", () => {
        if (s.sock === sock) s.sock = undefined;
      });
      resolve(sock);
    });
    sock.once("error", (err) => reject(err));
  });
}

async function flushSyslog(cfg: ForwarderConfig, batch: Forwardable[]): Promise<void> {
  const sock = await ensureSocket(cfg);
  const hostname = process.env.HOSTNAME ?? "host";
  for (const event of batch) {
    const line = formatSyslog5424(event, cfg, hostname);
    const ok = sock.write(`${line.length} ${line}`);
    if (!ok) {
      await new Promise<void>((r) => sock.once("drain", () => r()));
    }
  }
}

function formatSyslog5424(event: Forwardable, cfg: ForwarderConfig, hostname: string): string {
  const sev = severityFor(event.action);
  const pri = cfg.facility * 8 + sev;
  const ts = event.ts;
  const procid = process.pid.toString();
  const msgid = event.action.replace(/[^a-zA-Z0-9._-]/g, "");
  const sdData = formatStructuredData(event);
  const msg = `${event.actor ?? "anon"} ${event.action} ${event.resourceType}${event.resourceId ? `/${event.resourceId}` : ""}`;
  return `<${pri}>1 ${ts} ${hostname} ${cfg.appName} ${procid} ${msgid} ${sdData} ${msg}`;
}

function severityFor(action: string): number {
  if (action.includes(".error") || action.includes(".denied")) return 4;
  if (action.includes(".warn")) return 5;
  return 6;
}

function formatStructuredData(event: Forwardable): string {
  const fields: string[] = [];
  if (event.classification) fields.push(`classification="${event.classification}"`);
  if (event.actor) fields.push(`actor="${escSd(event.actor)}"`);
  if (event.resourceId) fields.push(`resource="${escSd(event.resourceId)}"`);
  if (event.meta) {
    for (const [k, v] of Object.entries(event.meta)) {
      const sk = k.replace(/[^a-zA-Z0-9_]/g, "_");
      fields.push(`${sk}="${escSd(String(v))}"`);
    }
  }
  if (fields.length === 0) return "-";
  return `[ci@32473 ${fields.join(" ")}]`;
}

function escSd(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\]/g, "\\]");
}
