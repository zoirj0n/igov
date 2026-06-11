import { classifyAsk, resolveCountriesFromText } from "@/services/chat/intent";
import { describe, expect, it } from "vitest";

describe("resolveCountriesFromText", () => {
  it("finds multiple countries in text order", () => {
    expect(resolveCountriesFromText("Compare UAE and Singapore on smart cities")).toEqual([
      "ARE",
      "SGP",
    ]);
    expect(resolveCountriesFromText("germany hydrogen cooperation with the uae")).toEqual([
      "DEU",
      "ARE",
    ]);
  });
  it("dedupes and caps at three", () => {
    expect(
      resolveCountriesFromText("UAE uae United Arab Emirates Brazil India Japan Korea"),
    ).toHaveLength(3);
  });
  it("returns empty when no country is named", () => {
    expect(resolveCountriesFromText("what is a smart city")).toEqual([]);
  });
});

describe("classifyAsk", () => {
  it("routes prepare phrasing to prepare with the country", () => {
    expect(classifyAsk("Prepare me for Japan")).toEqual({ kind: "prepare", countries: ["JPN"] });
    expect(classifyAsk("brief me on Indonesia's infrastructure")).toEqual({
      kind: "prepare",
      countries: ["IDN"],
    });
  });
  it("prepare phrasing WITHOUT a country falls back to general", () => {
    expect(classifyAsk("prepare me for the meeting").kind).toBe("general");
  });
  it("routes two-country questions to compare", () => {
    expect(classifyAsk("UAE vs Singapore smart cities")).toEqual({
      kind: "compare",
      countries: ["ARE", "SGP"],
    });
    expect(classifyAsk("Compare Germany and Japan on renewables")).toEqual({
      kind: "compare",
      countries: ["DEU", "JPN"],
    });
  });
  it("single-country analytical questions stay general", () => {
    expect(classifyAsk("UAE-Germany hydrogen collaboration policy").kind).toBe("compare");
    expect(classifyAsk("Indonesia infrastructure outlook")).toEqual({
      kind: "general",
      countries: ["IDN"],
    });
  });
});
