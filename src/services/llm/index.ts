import type { Classification } from "@/types";
import { anthropicProvider } from "./anthropic";
import { BudgetExceededError, checkBudget, resolveActorDept } from "./budget";
import { logLlmCall } from "./call-log";
import {
  OfflineModeError,
  type ProviderName,
  defaultModelFor,
  enforceOfflineGate,
  getLlmConfig,
  resolveProvider,
} from "./config";
import { localProvider } from "./local";
import { openrouterProvider } from "./openrouter";
import type { ChatTurn, CompleteResult, ProviderImpl } from "./types";

export function getProvider(name?: ProviderName): ProviderImpl {
  const p = name ?? getLlmConfig().provider;
  if (p === "openrouter") return openrouterProvider;
  if (p === "local") return localProvider;
  return anthropicProvider;
}

export interface CompleteTextOpts {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  classification?: Classification;
  /** Per-call model override (e.g. claude-haiku-4-5 for cheap classify steps). */
  model?: string;
  /** Telemetry hints. */
  step?:
    | "chat"
    | "complete"
    | "understand"
    | "briefing"
    | "classifier"
    | "ai-extract"
    | "video"
    | "sector-insights";
  actor?: string;
  actorDept?: string;
  sessionId?: string;
  reqId?: string;
  /** Constrain the provider to emit valid JSON (Ollama `format:"json"`). */
  json?: boolean;
}

/** Ollama tags ("qwen2.5:7b") have no vendor slash; cloud ids ("google/…") do. */
function isLocalModelTag(m: string): boolean {
  return !m.includes("/");
}

export async function completeText(opts: CompleteTextOpts): Promise<CompleteResult> {
  const cfg = getLlmConfig();
  const resolved = resolveProvider(opts.classification);
  const provider = getProvider(resolved);
  // Per-role model overrides from the agent are LOCAL tags. A cloud-resolved
  // call ignores them and uses the configured cloud model; the override still
  // applies if the call falls back to the local stack below.
  const resolvedDefault = resolved === cfg.provider ? cfg.model : defaultModelFor(resolved);
  const model =
    resolved === "local"
      ? (opts.model ?? resolvedDefault)
      : opts.model && !isLocalModelTag(opts.model)
        ? opts.model
        : resolvedDefault;
  // Offline gate: when admin has flipped offline=true, refuse any cloud
  // provider call before it leaves the process. Audit-trail surface: route
  // handlers catch OfflineModeError and emit `llm.offline.blocked`.
  enforceOfflineGate(resolved);
  // Budget gate (no-op unless BUDGET_ENFORCE_BLOCK=true).
  const effectiveDept = opts.actorDept ?? resolveActorDept(opts.actor);
  const decision = checkBudget(opts.actor ?? "system", effectiveDept);
  if (!decision.allowed) {
    setImmediate(async () => {
      try {
        const { logAudit } = await import("@/services/audit");
        logAudit(null, "cost.budget.blocked", "cost", {
          classification: opts.classification ?? "internal",
          reqId: opts.reqId,
          meta: {
            scope: decision.scope,
            actor: opts.actor ?? "system",
            actorDept: effectiveDept,
            spendUsd: decision.spendUsd,
            thresholdUsd: decision.thresholdUsd,
            step: opts.step ?? "complete",
            model,
            provider: resolved,
          },
        });
      } catch {
        /* swallow */
      }
    });
    throw new BudgetExceededError(decision);
  }
  const t0 = Date.now();
  const promptChars = opts.system.length + opts.messages.reduce((s, m) => s + m.content.length, 0);
  let errorClass: string | undefined;
  let result: CompleteResult;
  try {
    result = await provider.complete({
      system: opts.system,
      messages: opts.messages,
      classification: opts.classification ?? "internal",
      model,
      maxTokens: opts.maxTokens ?? 1024,
      json: opts.json,
    });
  } catch (err) {
    errorClass = err instanceof Error ? err.name : "Error";
    logLlmCall({
      actor: opts.actor ?? "system",
      actorDept: effectiveDept,
      reqId: opts.reqId,
      step: opts.step ?? "complete",
      provider: resolved,
      model,
      classification: opts.classification ?? "internal",
      promptChars,
      completionChars: 0,
      durationMs: Date.now() - t0,
      usedRealApi: provider.available(),
      sessionId: opts.sessionId,
      errorClass,
    });
    // Surface the cloud failure in server logs — the file call-log can be
    // unavailable (read-only fs), and a silent local fallback masks outages.
    console.error(
      `[llm] cloud ${resolved} failed (${opts.step ?? "complete"} · ${model}):`,
      err instanceof Error ? err.message : err,
    );
    // Cloud-first with sovereign fallback: any cloud failure (network, quota,
    // missing key) retries ONCE on the local Ollama stack with the caller's
    // per-role local model, so the pipeline never depends on the cloud.
    if (resolved !== "local") {
      const localModel =
        opts.model && isLocalModelTag(opts.model) ? opts.model : defaultModelFor("local");
      const t1 = Date.now();
      let fallback: CompleteResult;
      try {
        fallback = await localProvider.complete({
          system: opts.system,
          messages: opts.messages,
          classification: opts.classification ?? "internal",
          model: localModel,
          maxTokens: opts.maxTokens ?? 1024,
          json: opts.json,
        });
      } catch (localErr) {
        const cloudMsg = err instanceof Error ? err.message : String(err);
        const localMsg = localErr instanceof Error ? localErr.message : String(localErr);
        throw new Error(
          `cloud ${resolved} failed (${cloudMsg}); local fallback failed (${localMsg})`,
        );
      }
      logLlmCall({
        actor: opts.actor ?? "system",
        actorDept: effectiveDept,
        reqId: opts.reqId,
        step: opts.step ?? "complete",
        provider: "local",
        model: localModel,
        classification: opts.classification ?? "internal",
        promptChars,
        completionChars: fallback.text.length,
        actualPromptTokens: fallback.usage?.promptTokens,
        actualCompletionTokens: fallback.usage?.completionTokens,
        durationMs: Date.now() - t1,
        usedRealApi: fallback.usedRealApi,
        sessionId: opts.sessionId,
      });
      return fallback;
    }
    throw err;
  }
  logLlmCall({
    actor: opts.actor ?? "system",
    actorDept: effectiveDept,
    reqId: opts.reqId,
    step: opts.step ?? "complete",
    provider: resolved,
    model,
    classification: opts.classification ?? "internal",
    promptChars,
    completionChars: result.text.length,
    actualPromptTokens: result.usage?.promptTokens,
    actualCompletionTokens: result.usage?.completionTokens,
    durationMs: Date.now() - t0,
    usedRealApi: result.usedRealApi,
    sessionId: opts.sessionId,
  });
  return result;
}

export type { ProviderName, ClassKey } from "./config";
export {
  getLlmConfig,
  setLlmConfig,
  setClassMap,
  providerLabel,
  isCloud,
  defaultModelFor,
  resolveProvider,
} from "./config";
export type { ChatTurn, StreamChunk, CompleteResult, ProviderArgs, ProviderImpl } from "./types";
export { BudgetExceededError } from "./budget";
export { OfflineModeError, enforceOfflineGate } from "./config";
