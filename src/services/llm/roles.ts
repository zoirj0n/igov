/**
 * Per-role model selection for the agent fleet, provider-aware.
 *
 * Light roles (parsing, extraction, translation) use a fast/cheap model;
 * reasoning roles (analysis, strategy, forecast interpretation) use a mid
 * model; the SCRIBE — which writes the bilingual (EN/AR) executive prose
 * where quality matters most — gets its own knob. All overridable via env.
 *
 * Role names are resolved against the ACTIVE provider: Ollama tags
 * (qwen2.5:7b) are only valid on the local provider — sending them to
 * OpenRouter/Anthropic 400s, so each provider carries its own defaults.
 */
import { type ProviderName, defaultModelFor, resolveProvider } from "./config";

export type AgentRole =
  | "router"
  | "extract"
  | "translate"
  | "analyst"
  | "forecaster"
  | "strategist"
  | "scribe";

const LIGHT = new Set<AgentRole>(["router", "extract", "translate"]);

interface RoleModels {
  light: string;
  heavy: string;
  scribe: string;
}

function roleModels(provider: ProviderName): RoleModels {
  switch (provider) {
    case "local": {
      const heavy = process.env.OLLAMA_MODEL_HEAVY ?? "qwen2.5:7b";
      return {
        light: process.env.OLLAMA_MODEL_LIGHT ?? "qwen2.5:3b",
        heavy,
        scribe: process.env.OLLAMA_MODEL_SCRIBE ?? heavy,
      };
    }
    case "openrouter": {
      const heavy = process.env.OPENROUTER_MODEL_HEAVY ?? defaultModelFor("openrouter");
      return {
        // Light follows the configured model unless overridden — a hardcoded
        // paid tier here 402s accounts running on free-tier models.
        light: process.env.OPENROUTER_MODEL_LIGHT ?? heavy,
        heavy,
        scribe: process.env.OPENROUTER_MODEL_SCRIBE ?? heavy,
      };
    }
    case "anthropic": {
      const heavy = process.env.ANTHROPIC_MODEL_HEAVY ?? defaultModelFor("anthropic");
      return {
        light: process.env.ANTHROPIC_MODEL_LIGHT ?? "claude-haiku-4-5",
        heavy,
        scribe: process.env.ANTHROPIC_MODEL_SCRIBE ?? heavy,
      };
    }
  }
}

export function modelForRole(
  role: AgentRole,
  provider: ProviderName = resolveProvider(undefined),
): string {
  const m = roleModels(provider);
  if (role === "scribe") return m.scribe;
  return LIGHT.has(role) ? m.light : m.heavy;
}

/**
 * Trace-label model: what `completeText` will actually call. The per-role
 * overrides above are LOCAL tags; when the resolved provider is cloud, the
 * tag is ignored and the configured cloud model is used. Surface THAT model
 * in UI traces so the live tracker reflects reality, not local intent.
 */
import { getLlmConfig } from "./config";

export function displayModelForRole(role: AgentRole): string {
  const cfg = getLlmConfig();
  if (cfg.provider === "local") return modelForRole(role);
  return cfg.model;
}
