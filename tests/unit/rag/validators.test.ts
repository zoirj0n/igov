import {
  type VerifiedFact,
  convertUnit,
  parseNumberText,
  shouldAbstain,
  validateCitations,
  validateFigures,
} from "@/services/rag/validators";
import { describe, expect, it } from "vitest";

const factGdp: VerifiedFact = {
  id: "ind:SAU:gdp_usd:2024",
  value: 1_067_000_000_000,
  unit: "USD",
  year: 2024,
  source: "world_bank",
  valueType: "float",
};
const factPop: VerifiedFact = {
  id: "ind:SAU:population:2024",
  value: 36_947_000,
  unit: "",
  year: 2024,
  source: "world_bank",
  valueType: "int",
};

describe("parseNumberText", () => {
  it("parses plain integers", () => expect(parseNumberText("100")).toBe(100));
  it("parses comma thousands", () => expect(parseNumberText("1,067")).toBe(1067));
  it("parses trillion word", () => expect(parseNumberText("1.067 trillion")).toBe(1.067e12));
  it("parses billion suffix", () => expect(parseNumberText("36.9M")).toBe(36.9e6));
  it("returns null for non-numeric", () => expect(parseNumberText("hello")).toBeNull());
  it("strips currency", () => expect(parseNumberText("$1.067 trillion")).toBe(1.067e12));
});

describe("convertUnit", () => {
  it("same unit passes through", () => expect(convertUnit(100, "USD", "USD")).toBe(100));
  it("percent aliases", () => expect(convertUnit(50, "%", "percent")).toBe(50));
  it("unconvertible returns null", () => expect(convertUnit(100, "EUR", "USD")).toBeNull());
});

describe("validateFigures", () => {
  it("passes correct value within 0.5%", () => {
    const text = 'GDP is <fig id="ind:SAU:gdp_usd:2024" unit="USD">1.067 trillion</fig>.';
    const r = validateFigures(text, { [factGdp.id]: factGdp });
    expect(r.violations).toHaveLength(0);
    expect(r.passed).toContain(factGdp.id);
  });

  it("flags value mismatch beyond tolerance", () => {
    const text = '<fig id="ind:SAU:gdp_usd:2024" unit="USD">2 trillion</fig>';
    const r = validateFigures(text, { [factGdp.id]: factGdp });
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.violations[0]?.kind).toBe("fig.value_mismatch");
    expect(r.text).not.toContain("<fig");
  });

  it("flags unknown fact id", () => {
    const text = '<fig id="bogus:1" unit="USD">100</fig>';
    const r = validateFigures(text, { [factGdp.id]: factGdp });
    expect(r.violations[0]?.kind).toBe("fig.unknown_id");
  });

  it("int comparison rounds", () => {
    const text = '<fig id="ind:SAU:population:2024" unit="">36947000</fig>';
    const r = validateFigures(text, { [factPop.id]: factPop });
    expect(r.violations).toHaveLength(0);
  });

  it("flags unconvertible unit", () => {
    const text = '<fig id="ind:SAU:gdp_usd:2024" unit="EUR">1 trillion</fig>';
    const r = validateFigures(text, { [factGdp.id]: factGdp });
    expect(r.violations[0]?.kind).toBe("fig.unit_unconvertible");
  });
});

describe("validateCitations", () => {
  const passages = [
    { id: "doc:1", text: "x", source: "world_bank" },
    { id: "doc:2", text: "y", source: "imf" },
  ];

  it("keeps sentences with valid cite", () => {
    const text = 'Saudi GDP rose in 2024.<cite id="doc:1"/>';
    const r = validateCitations(text, passages);
    expect(r.violations).toHaveLength(0);
    expect(r.text).toContain("Saudi GDP rose");
  });

  it("drops factual sentence without cite", () => {
    const text = 'Saudi GDP rose 5% in 2024. Another sentence.<cite id="doc:1"/>';
    const r = validateCitations(text, passages);
    expect(r.violations.some((v) => v.kind === "cite.missing")).toBe(true);
    expect(r.text).not.toContain("Saudi GDP rose 5%");
    expect(r.text).toContain("Another sentence");
  });

  it("flags unknown cite ids", () => {
    const text = 'Claim.<cite id="bogus"/>';
    const r = validateCitations(text, passages);
    expect(r.violations.some((v) => v.kind === "cite.unknown_id")).toBe(true);
  });
});

describe("shouldAbstain", () => {
  it("never abstains on greetings", () => {
    const r = shouldAbstain({
      intent: "greeting",
      passages: [],
      questionEntities: [],
      coveredEntities: [],
      isNumeric: false,
      hasMatchingFact: false,
    });
    expect(r.abstained).toBe(false);
  });

  it("abstains when top score below threshold", () => {
    const r = shouldAbstain({
      intent: "factual",
      passages: [{ id: "x", text: "x", source: "s", score: 0.1 }],
      questionEntities: ["SAU"],
      coveredEntities: ["SAU"],
      isNumeric: false,
      hasMatchingFact: true,
    });
    expect(r.abstained).toBe(true);
    expect(r.reasons[0]).toMatch(/top rerank/);
  });

  it("abstains on numeric question with no matching fact", () => {
    const r = shouldAbstain({
      intent: "factual",
      passages: [{ id: "x", text: "x", source: "s", score: 0.9 }],
      questionEntities: ["SAU"],
      coveredEntities: ["SAU"],
      isNumeric: true,
      hasMatchingFact: false,
    });
    expect(r.abstained).toBe(true);
    expect(r.reasons[0]).toMatch(/numeric question/);
  });

  it("does not abstain when all checks pass", () => {
    const r = shouldAbstain({
      intent: "factual",
      passages: [{ id: "x", text: "x", source: "s", score: 0.7 }],
      questionEntities: ["SAU"],
      coveredEntities: ["SAU"],
      isNumeric: false,
      hasMatchingFact: true,
    });
    expect(r.abstained).toBe(false);
  });
});
