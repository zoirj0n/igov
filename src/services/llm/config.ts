import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export type ProviderName = "anthropic" | "openrouter" | "local";

export type ClassKey = "public" | "internal" | "confidential" | "secret";

export interface LlmConfig {
  provider: ProviderName;
  model: string;
  changedAt: string;
  changedBy: string;
  classMap?: Partial<Record<ClassKey, ProviderName>>;
  /**
   * Offline mode: when true, ALL cloud LLM calls are blocked regardless of
   * classification (overrides classMap, gate, env keys). Forces on-prem
   * (Ollama) or returns 503 if no on-prem path. Used for incident response,
   * data-residency audits, or scheduled air-gap exercises.
   */
  offline?: boolean;
  offlineSetAt?: string;
  offlineSetBy?: string;
}

export class OfflineModeError extends Error {
  constructor(public provider: ProviderName) {
    super(
      `Offline mode active — cloud provider "${provider}" is blocked. Switch to local LLM or disable offline mode.`,
    );
    this.name = "OfflineModeError";
  }
}

// Overridable so containers can keep this admin-mutable state on a volume
// instead of the image filesystem (which resets on recreate).
const STORE_PATH =
  process.env.LLM_CONFIG_PATH ?? path.join(process.cwd(), "data", "llm-config.json");

const DEFAULTS: Record<ProviderName, string> = {
  anthropic: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
  openrouter: process.env.OPENROUTER_MODEL ?? "anthropic/claude-opus-4",
  local: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
};

function envDefault(): LlmConfig {
  const fromEnv = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  const provider: ProviderName =
    fromEnv === "openrouter" || fromEnv === "local" ? fromEnv : "anthropic";
  return {
    provider,
    model: DEFAULTS[provider],
    changedAt: new Date(0).toISOString(),
    changedBy: "env",
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __ciLlmConfig: LlmConfig | undefined;
}

function loadFromDisk(): LlmConfig {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    if (
      parsed.provider === "anthropic" ||
      parsed.provider === "openrouter" ||
      parsed.provider === "local"
    ) {
      const cm: Partial<Record<ClassKey, ProviderName>> = {};
      if (parsed.classMap && typeof parsed.classMap === "object") {
        for (const k of ["public", "internal", "confidential", "secret"] as ClassKey[]) {
          const v = parsed.classMap[k];
          if (v === "anthropic" || v === "openrouter" || v === "local") cm[k] = v;
        }
      }
      // Env var OFFLINE_MODE=true forces offline regardless of persisted state
      // so an operator can air-gap from the shell without UI access.
      const envOffline = process.env.OFFLINE_MODE === "true" || process.env.OFFLINE_MODE === "1";
      return {
        provider: parsed.provider,
        model: parsed.model || DEFAULTS[parsed.provider],
        changedAt: parsed.changedAt ?? new Date(0).toISOString(),
        changedBy: parsed.changedBy ?? "unknown",
        classMap: cm,
        offline: envOffline || parsed.offline === true,
        offlineSetAt: parsed.offlineSetAt,
        offlineSetBy: parsed.offlineSetBy,
      };
    }
  } catch {
    // fall through
  }
  const envOffline = process.env.OFFLINE_MODE === "true" || process.env.OFFLINE_MODE === "1";
  const def = envDefault();
  if (envOffline) {
    def.offline = true;
    def.offlineSetAt = new Date().toISOString();
    def.offlineSetBy = "env";
  }
  return def;
}

let cache: LlmConfig = globalThis.__ciLlmConfig ?? loadFromDisk();
if (!globalThis.__ciLlmConfig) globalThis.__ciLlmConfig = cache;

export function getLlmConfig(): LlmConfig {
  return { ...cache };
}

export function setLlmConfig(
  provider: ProviderName,
  model: string | undefined,
  actor: string,
): LlmConfig {
  const m = model?.trim() || DEFAULTS[provider];
  cache = {
    provider,
    model: m,
    changedAt: new Date().toISOString(),
    changedBy: actor,
    classMap: cache.classMap,
  };
  persist();
  return { ...cache };
}

/** Drop the persisted override and fall back to the environment default
 *  (LLM_PROVIDER / *_MODEL) — the UI counterpart of wiping the state volume. */
export function resetLlmConfig(): LlmConfig {
  try {
    unlinkSync(STORE_PATH);
  } catch {
    // already absent
  }
  cache = envDefault();
  globalThis.__ciLlmConfig = cache;
  return { ...cache };
}

export function setOffline(offline: boolean, actor: string): LlmConfig {
  cache = {
    ...cache,
    offline,
    offlineSetAt: new Date().toISOString(),
    offlineSetBy: actor,
  };
  persist();
  return { ...cache };
}

export function setClassMap(
  map: Partial<Record<ClassKey, ProviderName>>,
  actor: string,
): LlmConfig {
  const clean: Partial<Record<ClassKey, ProviderName>> = {};
  for (const k of ["public", "internal", "confidential", "secret"] as ClassKey[]) {
    const v = map[k];
    if (v === "anthropic" || v === "openrouter" || v === "local") clean[k] = v;
  }
  cache = {
    ...cache,
    classMap: clean,
    changedAt: new Date().toISOString(),
    changedBy: actor,
  };
  persist();
  return { ...cache };
}

function persist(): void {
  globalThis.__ciLlmConfig = cache;
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("[llm.config] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function resolveProvider(classification: ClassKey | undefined): ProviderName {
  if (!classification) return cache.provider;
  return cache.classMap?.[classification] ?? cache.provider;
}

export function defaultModelFor(p: ProviderName): string {
  return DEFAULTS[p];
}

export function providerLabel(p: ProviderName): string {
  switch (p) {
    case "anthropic":
      return "Cloud · Anthropic direct";
    case "openrouter":
      return "Cloud · OpenRouter";
    case "local":
      return "On-prem · local LLM";
  }
}

export function isCloud(p: ProviderName): boolean {
  return p !== "local";
}

/**
 * Throw OfflineModeError if offline-mode is on AND the resolved provider is
 * cloud. Called from completeText / embed / rerank before any external call.
 */
export function enforceOfflineGate(p: ProviderName): void {
  if (cache.offline && isCloud(p)) {
    throw new OfflineModeError(p);
  }
}
