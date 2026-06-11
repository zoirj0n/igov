import { ROLE_KEYS, commandFor, roleSelectionFrom, searchQueryFor } from "@/lib/experience/roles";
import { describe, expect, it } from "vitest";

describe("commandFor", () => {
  it("builds the energy-minister command (router-proven shape)", () => {
    expect(commandFor("Brazil", { key: "energy" })).toBe("Prepare me for Brazil's Energy Minister");
  });
  it("builds sector commands for infrastructure and trade", () => {
    expect(commandFor("Germany", { key: "infrastructure" })).toBe(
      "Prepare me for Germany — infrastructure cooperation",
    );
    expect(commandFor("India", { key: "trade" })).toBe("Prepare me for India — trade & investment");
  });
  it("builds people-shaped commands for foreign / head of state / custom", () => {
    expect(commandFor("Japan", { key: "foreign" })).toBe("Prepare me for Japan's Foreign Minister");
    expect(commandFor("Brazil", { key: "headOfState" })).toBe(
      "Prepare me for a meeting with Brazil's Head of State",
    );
    expect(commandFor("Brazil", { key: "custom", customName: "Alexandre Silveira" })).toBe(
      "Prepare me for a meeting with Alexandre Silveira of Brazil",
    );
  });
  it("falls back when the custom name is blank", () => {
    expect(commandFor("Brazil", { key: "custom", customName: "  " })).toBe(
      "Prepare me for a meeting with the counterpart of Brazil",
    );
  });
  it("roleSelectionFrom validates keys and defaults to energy", () => {
    expect(roleSelectionFrom("trade")).toEqual({ key: "trade", customName: undefined });
    expect(roleSelectionFrom("bogus")).toEqual({ key: "energy" });
    expect(ROLE_KEYS).toContain("energy");
  });
});

describe("searchQueryFor", () => {
  it("maps preset roles to officeholder queries", () => {
    expect(searchQueryFor("Brazil", { key: "energy" })).toBe(
      "current Brazil minister of energy 2026",
    );
    expect(searchQueryFor("Japan", { key: "foreign" })).toBe(
      "current Japan minister of foreign affairs 2026",
    );
    expect(searchQueryFor("Brazil", { key: "headOfState" })).toBe(
      "current Brazil head of state president 2026",
    );
    expect(searchQueryFor("India", { key: "infrastructure" })).toBe(
      "current India minister of infrastructure 2026",
    );
    expect(searchQueryFor("India", { key: "trade" })).toBe(
      "current India minister of trade commerce 2026",
    );
  });
  it("uses the custom name directly", () => {
    expect(searchQueryFor("Brazil", { key: "custom", customName: "Alexandre Silveira" })).toBe(
      "Alexandre Silveira Brazil",
    );
  });
});
