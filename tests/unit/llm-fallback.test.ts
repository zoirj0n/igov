import { beforeEach, describe, expect, it, vi } from "vitest";

const orComplete = vi.fn();
const localComplete = vi.fn();

vi.mock("@/services/llm/config", () => ({
  getLlmConfig: () => ({
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    changedAt: "",
    changedBy: "test",
  }),
  resolveProvider: (c?: string) =>
    c === "confidential" || c === "secret" ? "local" : "openrouter",
  defaultModelFor: (p: string) => (p === "local" ? "llama3.1:8b" : "google/gemma-4-31b-it:free"),
  enforceOfflineGate: () => {},
  OfflineModeError: class extends Error {},
}));
vi.mock("@/services/llm/budget", () => ({
  checkBudget: () => ({ allowed: true }),
  resolveActorDept: () => undefined,
  BudgetExceededError: class extends Error {},
}));
vi.mock("@/services/llm/call-log", () => ({ logLlmCall: vi.fn() }));
vi.mock("@/services/llm/openrouter", () => ({
  openrouterProvider: {
    name: "openrouter",
    available: () => true,
    unavailableReason: () => "",
    complete: (a: unknown) => orComplete(a),
    stream: vi.fn(),
  },
}));
vi.mock("@/services/llm/local", () => ({
  localProvider: {
    name: "local",
    available: () => true,
    unavailableReason: () => "",
    complete: (a: unknown) => localComplete(a),
    stream: vi.fn(),
  },
}));
vi.mock("@/services/llm/anthropic", () => ({
  anthropicProvider: {
    name: "anthropic",
    available: () => false,
    unavailableReason: () => "no key",
    complete: vi.fn(),
    stream: vi.fn(),
  },
}));

import { completeText } from "@/services/llm";

function ok(provider: string, model: string, text: string) {
  return {
    text,
    citations: [],
    usedRealApi: true,
    classification: "internal" as const,
    provider,
    model,
  };
}

const BASE = {
  system: "You are terse.",
  messages: [{ role: "user" as const, content: "hi" }],
};

beforeEach(() => {
  orComplete.mockReset();
  localComplete.mockReset();
});

describe("completeText cloud-first routing", () => {
  it("ignores local per-role tags on the cloud path and uses the configured cloud model", async () => {
    orComplete.mockResolvedValueOnce(ok("openrouter", "google/gemma-4-31b-it:free", "cloud"));
    const res = await completeText({ ...BASE, model: "qwen2.5:7b" });
    expect(orComplete).toHaveBeenCalledTimes(1);
    expect((orComplete.mock.calls[0]?.[0] as { model: string }).model).toBe(
      "google/gemma-4-31b-it:free",
    );
    expect(localComplete).not.toHaveBeenCalled();
    expect(res.text).toBe("cloud");
  });

  it("keeps explicit cloud-shaped model overrides", async () => {
    orComplete.mockResolvedValueOnce(ok("openrouter", "anthropic/claude-opus-4", "cloud"));
    await completeText({ ...BASE, model: "anthropic/claude-opus-4" });
    expect((orComplete.mock.calls[0]?.[0] as { model: string }).model).toBe(
      "anthropic/claude-opus-4",
    );
  });

  it("falls back to the local stack with the caller's role model when the cloud fails", async () => {
    orComplete.mockRejectedValueOnce(new Error("openrouter 429: rate limited"));
    localComplete.mockResolvedValueOnce(ok("local", "qwen2.5:7b", "local-ok"));
    const res = await completeText({ ...BASE, model: "qwen2.5:7b" });
    expect(localComplete).toHaveBeenCalledTimes(1);
    expect((localComplete.mock.calls[0]?.[0] as { model: string }).model).toBe("qwen2.5:7b");
    expect(res.text).toBe("local-ok");
  });

  it("routes confidential straight to local — the cloud is never tried", async () => {
    localComplete.mockResolvedValueOnce(ok("local", "qwen2.5:7b", "sovereign"));
    const res = await completeText({
      ...BASE,
      model: "qwen2.5:7b",
      classification: "confidential",
    });
    expect(orComplete).not.toHaveBeenCalled();
    expect(res.text).toBe("sovereign");
  });

  it("surfaces both errors when cloud and local both fail", async () => {
    orComplete.mockRejectedValueOnce(new Error("openrouter 500"));
    localComplete.mockRejectedValueOnce(new Error("ollama unreachable"));
    await expect(completeText(BASE)).rejects.toThrow(/openrouter 500.*ollama unreachable/);
  });
});
