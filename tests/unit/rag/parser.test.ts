import {
  extractCites,
  extractFigs,
  normalizeQuotes,
  splitSentences,
  stripCite,
  stripFig,
} from "@/services/rag/parser";
import { describe, expect, it } from "vitest";

describe("normalizeQuotes", () => {
  it("converts smart quotes to ascii", () => {
    expect(normalizeQuotes("“GDP”")).toBe('"GDP"');
    expect(normalizeQuotes("don’t")).toBe("don't");
  });
});

describe("extractFigs", () => {
  it("parses double-quoted attrs", () => {
    const f = extractFigs('<fig id="ind:SAU:gdp_usd:2024" unit="USD">1.067 trillion</fig>');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "ind:SAU:gdp_usd:2024", unit: "USD", text: "1.067 trillion" });
  });

  it("accepts single quotes", () => {
    const f = extractFigs("<fig id='x:1' unit='%'>50</fig>");
    expect(f[0]).toMatchObject({ id: "x:1", unit: "%", text: "50" });
  });

  it("accepts unquoted attrs", () => {
    const f = extractFigs("<fig id=x:1 unit=USD>100</fig>");
    expect(f[0]?.id).toBe("x:1");
    expect(f[0]?.unit).toBe("USD");
  });

  it("normalizes smart quotes around attrs", () => {
    const f = extractFigs("<fig id=“x:1” unit=“USD”>1</fig>");
    expect(f[0]?.id).toBe("x:1");
  });

  it("returns empty for fig without id", () => {
    expect(extractFigs("<fig unit=USD>1</fig>")).toEqual([]);
  });

  it("captures multiple figs", () => {
    const f = extractFigs('a <fig id="a" unit="X">1</fig> and <fig id="b" unit="Y">2</fig>');
    expect(f.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("does not crash on malformed", () => {
    const f = extractFigs("<fig id=a unit>1</fig>");
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "a", unit: "", text: "1" });
  });
});

describe("extractCites", () => {
  it("parses self-closing", () => {
    const c = extractCites('text<cite id="doc:1"/>');
    expect(c[0]?.id).toBe("doc:1");
  });

  it("parses open+close form", () => {
    const c = extractCites('text<cite id="doc:1"></cite>');
    expect(c[0]?.id).toBe("doc:1");
  });

  it("parses missing self-close slash", () => {
    const c = extractCites('text<cite id="doc:1">');
    expect(c[0]?.id).toBe("doc:1");
  });

  it("ignores cite without id", () => {
    expect(extractCites("text<cite/>")).toEqual([]);
  });
});

describe("splitSentences", () => {
  it("splits on .!? at end", () => {
    const s = splitSentences("First. Second! Third? trailing");
    expect(s.map((x) => x.text)).toEqual(["First.", "Second!", "Third?", "trailing"]);
  });
});

describe("strip helpers", () => {
  it("replaces fig with inner text", () => {
    const txt = 'GDP is <fig id="x" unit="USD">$1T</fig> total.';
    const figs = extractFigs(txt);
    expect(stripFig(txt, figs[0]!)).toBe("GDP is $1T total.");
  });
  it("removes cite entirely", () => {
    const txt = 'Claim.<cite id="d:1"/>';
    const cites = extractCites(txt);
    expect(stripCite(txt, cites[0]!)).toBe("Claim.");
  });
});
