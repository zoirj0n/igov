import { ScopeSchema, emptyState } from "@/services/agent/state";
import { describe, expect, it } from "vitest";

describe("ScopeSchema", () => {
  it("parses a valid scope", () => {
    const s = ScopeSchema.parse({
      iso3: "BRA",
      sector: "energy",
      audience: "Minister of Energy",
      intent: "meeting_prep",
      classification: "internal",
    });
    expect(s.iso3).toBe("BRA");
    expect(s.sector).toBe("energy");
  });

  it("rejects a non-ISO3 country", () => {
    expect(() =>
      ScopeSchema.parse({
        iso3: "Brazil",
        sector: "energy",
        audience: "x",
        intent: "meeting_prep",
        classification: "internal",
      }),
    ).toThrow();
  });

  it("rejects an unknown sector", () => {
    expect(() =>
      ScopeSchema.parse({
        iso3: "BRA",
        sector: "tourism",
        audience: "Minister",
        intent: "meeting_prep",
        classification: "internal",
      }),
    ).toThrow();
  });
});

describe("emptyState", () => {
  it("starts with empty collections and the command", () => {
    const s = emptyState("Prepare me for Brazil");
    expect(s.command).toBe("Prepare me for Brazil");
    expect(s.indicators).toEqual([]);
    expect(s.opportunities).toEqual([]);
    expect(s.trace).toEqual([]);
    expect(s.classification).toBe("internal");
  });
});
