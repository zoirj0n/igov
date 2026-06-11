import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("siem", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SIEM_TRANSPORT;
    delete process.env.SIEM_HTTP_URL;
    delete process.env.SIEM_HTTP_TOKEN;
    delete (globalThis as { __ciSiem?: unknown }).__ciSiem;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SIEM_TRANSPORT;
    delete process.env.SIEM_HTTP_URL;
    delete process.env.SIEM_HTTP_TOKEN;
  });

  it("no-ops when SIEM_TRANSPORT=none", async () => {
    process.env.SIEM_TRANSPORT = "none";
    const mod = await import("@/lib/siem");
    expect(mod.siemEnabled()).toBe(false);
    expect(() =>
      mod.forwardEvent({ ts: new Date().toISOString(), action: "test", resourceType: "x" }),
    ).not.toThrow();
  });

  it("activates when SIEM_TRANSPORT=http", async () => {
    process.env.SIEM_TRANSPORT = "http";
    process.env.SIEM_HTTP_URL = "https://example.test/audit";
    const mod = await import("@/lib/siem");
    expect(mod.siemEnabled()).toBe(true);
  });
});
