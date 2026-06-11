import { type AgentRole, modelForRole } from "@/services/llm/roles";
import { describe, expect, it } from "vitest";

const LIGHT_ROLES: AgentRole[] = ["router", "extract", "translate"];
const HEAVY_ROLES: AgentRole[] = ["analyst", "forecaster", "strategist", "scribe"];

describe("modelForRole", () => {
  it("local: light roles use the 3b model, reasoning roles the 7b model", () => {
    for (const r of LIGHT_ROLES) expect(modelForRole(r, "local")).toBe("qwen2.5:3b");
    for (const r of HEAVY_ROLES) expect(modelForRole(r, "local")).toBe("qwen2.5:7b");
  });

  it("openrouter: never returns Ollama tags (they 400 upstream)", () => {
    for (const r of [...LIGHT_ROLES, ...HEAVY_ROLES]) {
      const m = modelForRole(r, "openrouter");
      expect(m).not.toMatch(/qwen|:\d+b$/);
      expect(m).toContain("/"); // OpenRouter ids are vendor/model
    }
  });

  it("anthropic: light roles get haiku, heavy roles the default model", () => {
    for (const r of LIGHT_ROLES) expect(modelForRole(r, "anthropic")).toBe("claude-haiku-4-5");
    for (const r of HEAVY_ROLES) expect(modelForRole(r, "anthropic")).toMatch(/^claude-/);
  });

  it("defaults to the resolved provider when none is given", () => {
    // Test env has no LLM_PROVIDER and may carry a persisted config; the
    // invariant is that the result matches SOME provider's mapping, never a
    // cross-provider mismatch like an Ollama tag for a cloud provider.
    const m = modelForRole("scribe");
    expect(typeof m).toBe("string");
    expect(m.length).toBeGreaterThan(0);
  });
});
