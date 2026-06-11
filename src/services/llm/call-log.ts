import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Classification } from "@/types";
import { recordSpend, resolveActorDept } from "./budget";
import type { ProviderName } from "./config";
import { estimateCostFromTokens, estimateCostUsd } from "./pricing";

/**
 * Per-call LLM telemetry. Written to logs/llm-calls.jsonl.
 * Used for cost tracking, capacity planning, and FOIA-style audit drill-downs.
 */

export interface LlmCallLogEntry {
  ts: string;
  actor: string;
  actorDept?: string;
  reqId?: string;
  step:
    | "chat"
    | "chat.stream"
    | "complete"
    | "understand"
    | "briefing"
    | "classifier"
    | "ai-extract"
    | "video"
    | "embed"
    | "rerank"
    | "sector-insights";
  provider: ProviderName | string;
  model: string;
  classification: Classification;
  promptChars: number;
  completionChars: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
  usedRealApi: boolean;
  sessionId?: string;
  errorClass?: string;
}

const FILE = path.join(process.cwd(), "logs", "llm-calls.jsonl");
let ensured = false;
async function ensureDir(): Promise<void> {
  if (ensured) return;
  await mkdir(path.dirname(FILE), { recursive: true });
  ensured = true;
}

export function logLlmCall(
  entry: Omit<LlmCallLogEntry, "ts" | "promptTokens" | "completionTokens" | "costUsd"> & {
    actualPromptTokens?: number;
    actualCompletionTokens?: number;
  },
): void {
  if (!entry.usedRealApi) {
    const full: LlmCallLogEntry = {
      ts: new Date().toISOString(),
      ...entry,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
    };
    setImmediate(async () => {
      try {
        await ensureDir();
        await appendFile(FILE, `${JSON.stringify(full)}\n`, { encoding: "utf-8" });
      } catch (err) {
        console.error("[llm-call-log] append failed:", err instanceof Error ? err.message : err);
      }
    });
    return;
  }
  const hasReal =
    typeof entry.actualPromptTokens === "number" &&
    typeof entry.actualCompletionTokens === "number";
  const tokensIn = hasReal ? entry.actualPromptTokens! : 0;
  const tokensOut = hasReal ? entry.actualCompletionTokens! : 0;
  const cost = hasReal
    ? estimateCostFromTokens(entry.model, tokensIn, tokensOut)
    : estimateCostUsd(entry.model, entry.promptChars, entry.completionChars);
  const full: LlmCallLogEntry = {
    ts: new Date().toISOString(),
    ...entry,
    promptTokens: hasReal ? tokensIn : cost.promptTokens,
    completionTokens: hasReal ? tokensOut : cost.completionTokens,
    costUsd: cost.costUsd,
  };
  // Track day spend + emit budget alert audit if a cap crossed.
  const effectiveDept = entry.actorDept ?? resolveActorDept(entry.actor);
  if (!entry.actorDept && effectiveDept) full.actorDept = effectiveDept;
  const record = recordSpend(entry.actor || "system", cost.costUsd, effectiveDept);
  if (record.alerts.length > 0) {
    // Lazy import to avoid circular ref at module load.
    setImmediate(async () => {
      try {
        const { logAudit } = await import("@/services/audit");
        for (const a of record.alerts) {
          logAudit(null, "cost.budget.exceeded", "cost", {
            classification: "internal",
            meta: {
              scope: a.scope,
              actor: a.actor,
              deptId: a.deptId,
              day: a.day,
              spendUsd: Number(a.spendUsd.toFixed(4)),
              thresholdUsd: a.thresholdUsd,
              triggeringCallActor: entry.actor,
              triggeringCallActorDept: entry.actorDept,
              triggeringCallModel: entry.model,
              triggeringCallCostUsd: cost.costUsd,
            },
          });
        }
      } catch (err) {
        console.error(
          "[llm-call-log] budget alert audit failed:",
          err instanceof Error ? err.message : err,
        );
      }
    });
  }
  setImmediate(async () => {
    try {
      await ensureDir();
      await appendFile(FILE, `${JSON.stringify(full)}\n`, { encoding: "utf-8" });
    } catch (err) {
      console.error("[llm-call-log] append failed:", err instanceof Error ? err.message : err);
    }
  });
}
