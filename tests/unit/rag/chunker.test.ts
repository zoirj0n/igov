import { chunkText } from "@/services/rag/chunker";
import { describe, expect, it } from "vitest";

describe("chunkText", () => {
  it("returns empty for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    const t = "Short doc. Two sentences only.";
    const r = chunkText(t);
    expect(r).toHaveLength(1);
    expect(r[0]?.text).toContain("Short doc");
    expect(r[0]?.text).toContain("Two sentences");
  });

  it("splits on sentence boundaries when over target", () => {
    const long = Array.from(
      { length: 40 },
      (_, i) => `Sentence number ${i} about the topic of interest.`,
    ).join(" ");
    const r = chunkText(long, { targetTokens: 30, overlapTokens: 3 });
    expect(r.length).toBeGreaterThan(1);
    // Each chunk should be near target size (chars ≈ tokens*4)
    for (const c of r) {
      expect(c.text.length).toBeLessThanOrEqual(200);
    }
  });

  it("produces overlap between consecutive chunks", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Sentence ${i}.`).join(" ");
    const r = chunkText(long, { targetTokens: 10, overlapTokens: 3 });
    expect(r.length).toBeGreaterThan(1);
    // Check that the last few chars of chunk[i] appear in chunk[i+1]
    for (let i = 0; i < r.length - 1; i++) {
      const tail = r[i]!.text.slice(-15);
      const next = r[i + 1]!.text;
      const overlap = tail.split(" ").some((w) => w && next.includes(w));
      expect(overlap).toBe(true);
    }
  });

  it("hard-splits a single sentence larger than target", () => {
    const giant = "Word ".repeat(500).trim() + ".";
    const r = chunkText(giant, { targetTokens: 20, overlapTokens: 2 });
    expect(r.length).toBeGreaterThan(1);
  });

  it("preserves char offsets", () => {
    const t = "First sentence. Second sentence. Third sentence.";
    const r = chunkText(t, { targetTokens: 4, overlapTokens: 1 });
    for (const c of r) {
      expect(t.slice(c.start, c.end)).toContain(c.text.slice(0, 5));
    }
  });
});
