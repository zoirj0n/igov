import { parseScope } from "@/services/agent/nodes";
import { describe, expect, it } from "vitest";

describe("parseScope", () => {
  it("extracts a valid scope from fenced model JSON", () => {
    const raw =
      '```json\n{"iso3":"BRA","sector":"energy","audience":"Minister of Energy","intent":"meeting_prep","classification":"internal"}\n```';
    const scope = parseScope(raw);
    expect(scope?.iso3).toBe("BRA");
    expect(scope?.sector).toBe("energy");
  });

  it("extracts scope from raw JSON without fences", () => {
    const raw =
      'Here you go: {"iso3":"DEU","sector":"trade","audience":"Undersecretary","intent":"comparison","classification":"public"} done';
    expect(parseScope(raw)?.iso3).toBe("DEU");
  });

  it("returns null when there is no parseable scope", () => {
    expect(parseScope("no json here")).toBeNull();
  });

  it("returns null when JSON is present but invalid as a scope", () => {
    expect(parseScope('{"iso3":"Brazil","sector":"energy"}')).toBeNull();
  });
});
