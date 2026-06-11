import { rankVoice, stripForSpeech } from "@/lib/hooks/useVoice";
import { describe, expect, it } from "vitest";

function fakeVoice(over: Partial<SpeechSynthesisVoice>): SpeechSynthesisVoice {
  return {
    name: "Test",
    lang: "en-US",
    localService: true,
    default: false,
    voiceURI: "test",
    ...over,
  } as SpeechSynthesisVoice;
}

describe("rankVoice", () => {
  it("prefers natural/neural voices over novelty voices", () => {
    const novelty = fakeVoice({ name: "Albert", lang: "en-US" });
    const natural = fakeVoice({ name: "Microsoft Aria Natural", lang: "en-US" });
    expect(rankVoice(natural, "en")).toBeGreaterThan(rankVoice(novelty, "en"));
    expect(rankVoice(novelty, "en")).toBeLessThan(0);
  });

  it("rejects wrong-language voices", () => {
    expect(rankVoice(fakeVoice({ lang: "fr-FR" }), "en")).toBe(-1);
    expect(rankVoice(fakeVoice({ lang: "en-US" }), "ar")).toBe(-1);
  });

  it("prefers exact regional match", () => {
    const exact = fakeVoice({ name: "Majed", lang: "ar-AE" });
    const generic = fakeVoice({ name: "Majed", lang: "ar-SA" });
    expect(rankVoice(exact, "ar")).toBeGreaterThan(rankVoice(generic, "ar"));
  });
});

describe("stripForSpeech", () => {
  it("strips markdown chrome but keeps prose", () => {
    const md = [
      "## Energy outlook",
      "",
      "**Brazil** added `12 GW` of [solar](https://example.org) in 2025.",
      "",
      "- Grid expansion lags",
      "- Auctions oversubscribed",
      "",
      "| year | GW |",
      "| ---- | -- |",
      "| 2025 | 12 |",
      "",
      "```sql",
      "SELECT 1;",
      "```",
    ].join("\n");
    const out = stripForSpeech(md);
    expect(out).toContain("Energy outlook");
    expect(out).toContain("Brazil added 12 GW of solar in 2025.");
    expect(out).toContain("Grid expansion lags");
    expect(out).not.toContain("#");
    expect(out).not.toContain("**");
    expect(out).not.toContain("|");
    expect(out).not.toContain("https://example.org");
    expect(out).not.toContain("SELECT");
  });

  it("keeps Arabic text intact", () => {
    expect(stripForSpeech("**التوقعات** لقطاع [الطاقة](https://x.y) قوية")).toBe(
      "التوقعات لقطاع الطاقة قوية",
    );
  });

  it("collapses whitespace", () => {
    expect(stripForSpeech("a\n\n\nb   c")).toBe("a b c");
  });
});
